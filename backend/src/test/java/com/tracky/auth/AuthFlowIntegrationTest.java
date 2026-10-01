package com.tracky.auth;

import com.tracky.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Fluxo completo de autenticação contra um Postgres real. */
class AuthFlowIntegrationTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    private static String uniqueEmail() {
        return "user-" + UUID.randomUUID() + "@test.pt";
    }

    private static String registerJson(String email) {
        return """
                {"name":"Teste","email":"%s","password":"segredo123"}
                """.formatted(email);
    }

    @Test
    void registoDevolveTokenEDadosDoUtilizador() throws Exception {
        String email = uniqueEmail();
        mvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registerJson(email)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.user.email").value(email))
                .andExpect(jsonPath("$.user.baseCurrency").value("EUR"));
    }

    @Test
    void emailDuplicadoDevolve409() throws Exception {
        String email = uniqueEmail();
        mvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registerJson(email)))
                .andExpect(status().isOk());
        mvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registerJson(email)))
                .andExpect(status().isConflict());
    }

    @Test
    void passwordCurtaDevolve400() throws Exception {
        mvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Teste","email":"%s","password":"123"}
                                """.formatted(uniqueEmail())))
                .andExpect(status().isBadRequest());
    }

    @Test
    void registoExigeOitoCaracteres_seteDevolve400_oitoAceita() throws Exception {
        mvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Teste","email":"%s","password":"1234567"}
                                """.formatted(uniqueEmail())))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Teste","email":"%s","password":"12345678"}
                                """.formatted(uniqueEmail())))
                .andExpect(status().isOk());
    }

    @Test
    void loginNaoValidaOComprimentoDaPalavraPasse() throws Exception {
        // contas antigas podem ter palavras-passe com menos de 8 caracteres
        mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"abc"}
                                """.formatted(uniqueEmail())))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void camposDeRegistoDemasiadoLongosDevolvem400() throws Exception {
        mvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"%s","email":"%s","password":"segredo123"}
                                """.formatted("x".repeat(101), uniqueEmail())))
                .andExpect(status().isBadRequest());
    }

    @Test
    void loginComCredenciaisCertasEErradas() throws Exception {
        String email = uniqueEmail();
        mvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registerJson(email)))
                .andExpect(status().isOk());

        mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"segredo123"}
                                """.formatted(email)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty());

        mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"errada999"}
                                """.formatted(email)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void endpointProtegidoExigeToken() throws Exception {
        mvc.perform(get("/api/goals")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/goals").header("Authorization", "Bearer token-invalido"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void tokenValidoDaAcessoAoPerfilEEndpointsProtegidos() throws Exception {
        String email = uniqueEmail();
        String body = mvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registerJson(email)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String token = com.jayway.jsonpath.JsonPath.read(body, "$.token");

        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(email));

        mvc.perform(get("/api/goals").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
    }

    @Test
    void moedaBaseValidaEAlterada_invalidaDevolve400() throws Exception {
        String email = uniqueEmail();
        String body = mvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registerJson(email)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String token = com.jayway.jsonpath.JsonPath.read(body, "$.token");

        // moeda suportada (lista estática — sem chamadas de rede)
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .put("/api/auth/me/currency")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"baseCurrency":"usd"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.baseCurrency").value("USD"));

        // moeda inventada é rejeitada
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .put("/api/auth/me/currency")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"baseCurrency":"XYZ"}
                                """))
                .andExpect(status().isBadRequest());
    }
}
