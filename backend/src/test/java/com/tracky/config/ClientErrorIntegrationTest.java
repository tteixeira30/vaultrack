package com.tracky.config;

import com.jayway.jsonpath.JsonPath;
import com.tracky.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(OutputCaptureExtension.class)
class ClientErrorIntegrationTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    private static final String BODY = """
            {"message":"TypeError: x is undefined\\nlinha falsa","stack":"at f (app.js:1)","version":"2026-10-05","platform":"web","screen":"goals"}
            """;

    @Test
    void semSessaoDa401() throws Exception {
        mvc.perform(post("/api/client-errors").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void comSessaoFicaNoLogNumaSoLinhaEDa204(CapturedOutput out) throws Exception {
        String body = mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content("""
                        {"name":"Cliente","email":"client-%s@test.pt","password":"segredo123"}
                        """.formatted(UUID.randomUUID())))
                .andReturn().getResponse().getContentAsString();
        String token = JsonPath.read(body, "$.token");

        mvc.perform(post("/api/client-errors").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isNoContent());

        assertThat(out).contains("Erro no cliente [web 2026-10-05] em goals: TypeError: x is undefined linha falsa");
    }
}
