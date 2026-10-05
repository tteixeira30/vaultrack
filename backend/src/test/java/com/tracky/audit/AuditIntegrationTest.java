package com.tracky.audit;

import com.jayway.jsonpath.JsonPath;
import com.tracky.AbstractIntegrationTest;
import com.tracky.config.RequestLogFilter;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Trilho de auditoria contra um Postgres real. Os eventos encontram-se pelo X-Request-Id. */
class AuditIntegrationTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuditEventRepository repo;
    @Autowired AuditService audit;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager txManager;

    private record Session(long id, String email, String token) {}

    private Session register() throws Exception {
        String email = "audit-" + UUID.randomUUID() + "@test.pt";
        String body = mvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Auditoria","email":"%s","password":"segredo123"}
                                """.formatted(email)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        Number id = JsonPath.read(body, "$.user.id");
        return new Session(id.longValue(), email, JsonPath.read(body, "$.token"));
    }

    private static MockHttpServletRequestBuilder auth(MockHttpServletRequestBuilder b, Session s) {
        return b.header("Authorization", "Bearer " + s.token());
    }

    private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder b, String body) {
        return b.contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private List<AuditEvent> eventsOf(MvcResult r) {
        return repo.findByRequestId(r.getResponse().getHeader(RequestLogFilter.HEADER));
    }

    private MvcResult login(String email, String password) throws Exception {
        return mvc.perform(json(post("/api/auth/login"), """
                {"email":"%s","password":"%s"}
                """.formatted(email, password))).andReturn();
    }

    @Test
    void loginGravaExatamenteUmEventoEmCadaUmDosTresCasos() throws Exception {
        Session s = register();

        List<AuditEvent> ok = eventsOf(login(s.email(), "segredo123"));
        assertThat(ok).singleElement().satisfies(e -> {
            assertThat(e.getAction()).isEqualTo("LOGIN_SUCCEEDED");
            assertThat(e.getUserId()).isEqualTo(s.id());
            assertThat(e.getKind()).isEqualTo("SECURITY");
            assertThat(e.getActor()).isEqualTo("USER");
            assertThat(e.getIp()).isNotBlank();
        });

        List<AuditEvent> wrong = eventsOf(login(s.email(), "errada123"));
        assertThat(wrong).singleElement().satisfies(e -> {
            assertThat(e.getAction()).isEqualTo("LOGIN_FAILED");
            assertThat(e.getUserId()).isEqualTo(s.id());
        });

        List<AuditEvent> unknown = eventsOf(login("ninguem-" + UUID.randomUUID() + "@test.pt", "errada123"));
        assertThat(unknown).singleElement().satisfies(e -> {
            assertThat(e.getAction()).isEqualTo("LOGIN_FAILED");
            assertThat(e.getUserId()).isNull();
            assertThat(e.getDetails()).isNull();
        });
    }

    @Test
    void crudDeObjetivoGravaEventosEEdicaoSemMudancasNao() throws Exception {
        Session s = register();
        String goal = """
                {"name":"Férias","targetAmount":1000,"monthlyAllocation":200}
                """;

        MvcResult created = mvc.perform(auth(json(post("/api/goals"), goal), s)).andReturn();
        Number id = JsonPath.read(created.getResponse().getContentAsString(), "$.id");
        assertThat(eventsOf(created)).singleElement().satisfies(e -> {
            assertThat(e.getAction()).isEqualTo("CREATED");
            assertThat(e.getEntityType()).isEqualTo("GOAL");
            assertThat(e.getEntityId()).isEqualTo(id.longValue());
            assertThat(e.getDetails()).containsEntry("label", "Férias");
        });

        MvcResult same = mvc.perform(auth(json(put("/api/goals/" + id), goal), s)).andReturn();
        assertThat(same.getResponse().getStatus()).isEqualTo(200);
        assertThat(eventsOf(same)).isEmpty();

        MvcResult edited = mvc.perform(auth(json(put("/api/goals/" + id), """
                {"name":"Férias","targetAmount":1500,"monthlyAllocation":200}
                """), s)).andReturn();
        assertThat(eventsOf(edited)).singleElement().satisfies(e -> {
            assertThat(e.getAction()).isEqualTo("UPDATED");
            assertThat(e.getDetails().get("changes").toString()).contains("targetAmount").doesNotContain("name");
        });

        MvcResult contributed = mvc.perform(auth(json(post("/api/goals/" + id + "/contribute"), """
                {"amount":50}
                """), s)).andReturn();
        assertThat(eventsOf(contributed)).singleElement()
                .satisfies(e -> assertThat(e.getAction()).isEqualTo("CONTRIBUTED"));

        MvcResult deleted = mvc.perform(auth(delete("/api/goals/" + id), s)).andReturn();
        assertThat(eventsOf(deleted)).singleElement()
                .satisfies(e -> assertThat(e.getAction()).isEqualTo("DELETED"));
    }

    @Test
    void cadaUtilizadorSoVeOsSeusEventos() throws Exception {
        Session a = register();
        Session b = register();
        mvc.perform(auth(json(post("/api/goals"), """
                {"name":"Só do A","targetAmount":100,"monthlyAllocation":10}
                """), a)).andExpect(status().isOk());

        String body = mvc.perform(auth(get("/api/audit"), b))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        List<Number> users = JsonPath.read(body, "$.events[*].userId");
        assertThat(users).isNotEmpty().allSatisfy(u -> assertThat(u.longValue()).isEqualTo(b.id()));
        assertThat(body).doesNotContain("Só do A");

        mvc.perform(auth(get("/api/audit").param("kind", "data"), a))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.events.length()").value(1))
                .andExpect(jsonPath("$.events[0].details.label").value("Só do A"));
        mvc.perform(auth(get("/api/audit").param("kind", "x"), a)).andExpect(status().isBadRequest());
    }

    @Test
    void paginacaoPorCursor() throws Exception {
        Session s = register();
        for (int i = 0; i < 3; i++) {
            mvc.perform(auth(json(post("/api/goals"), """
                    {"name":"G%d","targetAmount":100,"monthlyAllocation":10}
                    """.formatted(i)), s)).andExpect(status().isOk());
        }
        String first = mvc.perform(auth(get("/api/audit").param("kind", "data").param("limit", "2"), s))
                .andExpect(jsonPath("$.events.length()").value(2))
                .andReturn().getResponse().getContentAsString();
        Number next = JsonPath.read(first, "$.nextBefore");
        mvc.perform(auth(get("/api/audit").param("kind", "data").param("limit", "2")
                        .param("before", next.toString()), s))
                .andExpect(jsonPath("$.events.length()").value(1))
                .andExpect(jsonPath("$.events[0].details.label").value("G0"))
                .andExpect(jsonPath("$.nextBefore").doesNotExist());
    }

    @Test
    void vistaDeAdminExigeOPapel() throws Exception {
        Session admin = register();
        Session other = register();
        mvc.perform(auth(get("/api/admin/audit"), admin))
                .andExpect(status().isForbidden())
                .andExpect(status().reason("Sem permissão."));

        jdbc.update("UPDATE users SET admin = true WHERE id = ?", admin.id());

        mvc.perform(auth(get("/api/auth/me"), admin)).andExpect(jsonPath("$.admin").value(true));
        mvc.perform(auth(get("/api/auth/me"), other)).andExpect(jsonPath("$.admin").value(false));
        mvc.perform(auth(get("/api/admin/audit").param("userId", String.valueOf(other.id())), admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.events[0].userId").value(other.id()))
                .andExpect(jsonPath("$.events[0].userEmail").value(other.email()))
                .andExpect(jsonPath("$.events[0].action").value("REGISTERED"));
        mvc.perform(auth(get("/api/admin/audit"), other)).andExpect(status().isForbidden());
    }

    @Test
    void rollbackNaoDeixaEvento() {
        long marker = -System.nanoTime();
        new TransactionTemplate(txManager).executeWithoutResult(status -> {
            audit.created(marker, AuditEntity.GOAL, 1L, "rollback", null);
            status.setRollbackOnly();
        });
        assertThat(repo.findForUser(marker, null, null, org.springframework.data.domain.Pageable.ofSize(5))).isEmpty();

        new TransactionTemplate(txManager).executeWithoutResult(status ->
                audit.created(marker, AuditEntity.GOAL, 1L, "commit", null));
        assertThat(repo.findForUser(marker, null, null, org.springframework.data.domain.Pageable.ofSize(5))).hasSize(1);
    }
}
