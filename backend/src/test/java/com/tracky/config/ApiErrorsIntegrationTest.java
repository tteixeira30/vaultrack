package com.tracky.config;

import com.jayway.jsonpath.JsonPath;
import com.tracky.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.hamcrest.Matchers.*;

/** Erros 400 em PT-PT sem detalhes técnicos: JSON inválido, números enormes, ganho <= -100%. */
class ApiErrorsIntegrationTest extends AbstractIntegrationTest {

    private static final String INVALIDO = "Pedido inválido: verifica os valores introduzidos.";
    private static final String ENORME = "O valor introduzido é demasiado grande.";

    @Autowired MockMvc mvc;

    private String token() throws Exception {
        String body = mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Teste\",\"email\":\"u-%s@test.pt\",\"password\":\"segredo123\"}"
                                .formatted(UUID.randomUUID())))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.token");
    }

    private MockHttpServletRequestBuilder send(String path, String token, String json) {
        return post(path).header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content(json);
    }

    private long account(String token) throws Exception {
        String b = mvc.perform(send("/api/expenses/accounts", token, "{\"name\":\"Conta\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(b, "$.id")).longValue();
    }

    @Test
    void dataInvalidaDa400GenericoSemJackson() throws Exception {
        String t = token();
        long acc = account(t);
        mvc.perform(send("/api/expenses/transactions", t,
                        "{\"accountId\":%d,\"date\":\"abc\",\"description\":\"x\",\"amount\":1}".formatted(acc)))
                .andExpect(status().isBadRequest())
                .andExpect(status().reason(INVALIDO));
    }

    @Test
    void montanteNaoNumericoEJsonMalFormadoDao400Generico() throws Exception {
        String t = token();
        long acc = account(t);
        mvc.perform(send("/api/expenses/transactions", t,
                        "{\"accountId\":%d,\"date\":\"2026-09-01\",\"description\":\"x\",\"amount\":\"abc\"}".formatted(acc)))
                .andExpect(status().isBadRequest()).andExpect(status().reason(INVALIDO));
        mvc.perform(send("/api/expenses/transactions", t, "{nao e json"))
                .andExpect(status().isBadRequest()).andExpect(status().reason(INVALIDO));
    }

    @Test
    void parametroComTipoErradoDa400Generico() throws Exception {
        String t = token();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .get("/api/expenses").param("accountId", "abc")
                        .header("Authorization", "Bearer " + t))
                .andExpect(status().isBadRequest()).andExpect(status().reason(INVALIDO));
    }

    @Test
    void montantesEnormesDao400EmVezDe500() throws Exception {
        String t = token();
        long acc = account(t);
        for (String amount : new String[]{"1e309", "99999999999999999999"}) {
            mvc.perform(send("/api/expenses/transactions", t,
                            "{\"accountId\":%d,\"date\":\"2026-09-01\",\"description\":\"x\",\"amount\":%s}".formatted(acc, amount)))
                    .andExpect(status().isBadRequest()).andExpect(status().reason(ENORME));
        }
        mvc.perform(send("/api/expenses/accounts", t, "{\"name\":\"C2\",\"currentBalance\":99999999999999999999999}"))
                .andExpect(status().isBadRequest()).andExpect(status().reason(ENORME));
        mvc.perform(send("/api/investments", t,
                        "{\"name\":\"X\",\"type\":\"OTHER\",\"currentValue\":1e30,\"gainPercent\":0}"))
                .andExpect(status().isBadRequest()).andExpect(status().reason(ENORME));
    }

    @Test
    void ganhoIgualOuAbaixoDeMenos100Da400() throws Exception {
        String t = token();
        for (String gain : new String[]{"-100", "-150"}) {
            mvc.perform(send("/api/investments", t,
                            "{\"name\":\"X\",\"type\":\"OTHER\",\"currentValue\":100,\"gainPercent\":%s}".formatted(gain)))
                    .andExpect(status().isBadRequest())
                    .andExpect(status().reason(containsString("-100%")));
        }
    }
}
