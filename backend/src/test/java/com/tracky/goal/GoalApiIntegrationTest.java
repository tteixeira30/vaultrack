package com.tracky.goal;

import com.jayway.jsonpath.JsonPath;
import com.tracky.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** CRUD de objetivos com JWT real e isolamento entre utilizadores. */
class GoalApiIntegrationTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    /** Regista um utilizador novo e devolve o token JWT. */
    private String registerAndGetToken() throws Exception {
        String body = mvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Teste","email":"user-%s@test.pt","password":"segredo123"}
                                """.formatted(UUID.randomUUID())))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.token");
    }

    @Test
    void crudCompletoDeObjetivos() throws Exception {
        String token = registerAndGetToken();

        // criar
        String created = mvc.perform(post("/api/goals")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Férias","targetAmount":1000,"monthlyAllocation":200}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Férias"))
                .andExpect(jsonPath("$.progressPercent").value(0.0))
                .andReturn().getResponse().getContentAsString();
        Number id = JsonPath.read(created, "$.id");

        // listar
        mvc.perform(get("/api/goals").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));

        // atualizar
        mvc.perform(put("/api/goals/" + id)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Férias 2027","targetAmount":2000,"monthlyAllocation":250,"savedAmount":500}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Férias 2027"))
                .andExpect(jsonPath("$.progressPercent").value(25.0));

        // contribuir
        mvc.perform(post("/api/goals/" + id + "/contribute")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"amount":500}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.savedAmount").value(1000.0))
                .andExpect(jsonPath("$.progressPercent").value(50.0));

        // apagar
        mvc.perform(delete("/api/goals/" + id).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
        mvc.perform(get("/api/goals").header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void contribuicaoNegativaNuncaDeixaOSaldoAbaixoDeZero() throws Exception {
        String token = registerAndGetToken();

        String created = mvc.perform(post("/api/goals")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Fundo","targetAmount":1000,"monthlyAllocation":100,"savedAmount":100}
                                """))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        Number id = JsonPath.read(created, "$.id");

        // retirar mais do que existe → o UPDATE atómico limita a 0, nunca negativo
        mvc.perform(post("/api/goals/" + id + "/contribute")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"amount":-500}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.savedAmount").value(0.0));
    }

    @Test
    void objetivosDeUmUtilizadorNaoSaoVisiveisNemApagaveisPorOutro() throws Exception {
        String tokenA = registerAndGetToken();
        String tokenB = registerAndGetToken();

        String created = mvc.perform(post("/api/goals")
                        .header("Authorization", "Bearer " + tokenA)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Casa","targetAmount":50000,"monthlyAllocation":500}
                                """))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        Number id = JsonPath.read(created, "$.id");

        // B não vê o objetivo de A
        String listB = mvc.perform(get("/api/goals").header("Authorization", "Bearer " + tokenB))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(listB.contains("Casa")).isFalse();

        // apagar como B não tem efeito; o objetivo de A continua lá
        mvc.perform(delete("/api/goals/" + id).header("Authorization", "Bearer " + tokenB))
                .andExpect(status().isOk());
        mvc.perform(get("/api/goals").header("Authorization", "Bearer " + tokenA))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].name").value("Casa"));
    }

    @Test
    void alterarObjetivoDeOutroUtilizadorDa404ENao500() throws Exception {
        String tokenA = registerAndGetToken();
        String tokenB = registerAndGetToken();

        String created = mvc.perform(post("/api/goals")
                        .header("Authorization", "Bearer " + tokenA)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Carro","targetAmount":8000,"monthlyAllocation":300}
                                """))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        Number id = JsonPath.read(created, "$.id");

        // 404 e não 403: B não fica a saber que o id existe
        mvc.perform(put("/api/goals/" + id)
                        .header("Authorization", "Bearer " + tokenB)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Roubado","targetAmount":1,"monthlyAllocation":1}
                                """))
                .andExpect(status().isNotFound())
                .andExpect(status().reason("Objetivo não encontrado."));

        mvc.perform(post("/api/goals/" + id + "/contribute")
                        .header("Authorization", "Bearer " + tokenB)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"amount":100}
                                """))
                .andExpect(status().isNotFound());

        // id que não existe de todo → a mesma resposta
        mvc.perform(put("/api/goals/999999999")
                        .header("Authorization", "Bearer " + tokenA)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"X","targetAmount":1,"monthlyAllocation":1}
                                """))
                .andExpect(status().isNotFound());
    }

    @Test
    void validacaoRejeitaObjetivoSemNomeOuComAlvoNegativo() throws Exception {
        String token = registerAndGetToken();

        mvc.perform(post("/api/goals")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"","targetAmount":1000,"monthlyAllocation":200}
                                """))
                .andExpect(status().isBadRequest());

        mvc.perform(post("/api/goals")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Inválido","targetAmount":-5,"monthlyAllocation":200}
                                """))
                .andExpect(status().isBadRequest());
    }
}
