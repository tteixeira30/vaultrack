package com.tracky.expense;

import com.jayway.jsonpath.JsonPath;
import com.tracky.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Limites de tamanho dos pedidos de despesas: excedê-los dá 400, não 500. */
class ExpenseApiIntegrationTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

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

    private Number createAccount(String token) throws Exception {
        String body = mvc.perform(post("/api/expenses/accounts")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Conta"}
                                """))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.id");
    }

    @Test
    void importComMaisDe5000LinhasDevolve400() throws Exception {
        String token = registerAndGetToken();
        Number accountId = createAccount(token);
        String row = "{\"date\":\"2026-09-01\",\"description\":\"Café\",\"amount\":1.5,\"inflow\":false}";
        String rows = String.join(",", java.util.Collections.nCopies(5001, row));

        mvc.perform(post("/api/expenses/import")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"accountId\":" + accountId + ",\"rows\":[" + rows + "]}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void descricaoDemasiadoLongaNumMovimentoDevolve400() throws Exception {
        String token = registerAndGetToken();
        Number accountId = createAccount(token);

        mvc.perform(post("/api/expenses/transactions")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"accountId":%s,"date":"2026-09-01","description":"%s","amount":1.5,"inflow":false}
                                """.formatted(accountId, "x".repeat(501))))
                .andExpect(status().isBadRequest());

        // no limite (500) continua a ser aceite
        mvc.perform(post("/api/expenses/transactions")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"accountId":%s,"date":"2026-09-01","description":"%s","amount":1.5,"inflow":false}
                                """.formatted(accountId, "x".repeat(500))))
                .andExpect(status().isOk());
    }
}
