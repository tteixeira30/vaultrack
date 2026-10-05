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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Os logs levam ids, nunca conteúdo: nem palavra-passe, nem token, nem convite, nem email. */
@ExtendWith(OutputCaptureExtension.class)
class LogSecretsIntegrationTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    @Test
    void registoELoginNaoDeixamSegredosNoLog(CapturedOutput out) throws Exception {
        String email = "logs-" + UUID.randomUUID() + "@test.pt";
        String password = "Pw-" + UUID.randomUUID();
        String invite = "convite-" + UUID.randomUUID();

        String body = mvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Logs","email":"%s","password":"%s","inviteCode":"%s"}
                                """.formatted(email, password, invite)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String token = JsonPath.read(body, "$.token");

        mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"%s"}
                                """.formatted(email, password)))
                .andExpect(status().isOk());
        mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"%s-errada"}
                                """.formatted(email, password)))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/goals").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        assertThat(out).contains("POST /api/auth/login 401");
        assertThat(out.getAll())
                .doesNotContain(password)
                .doesNotContain(token)
                .doesNotContain(invite)
                .doesNotContain(email);
    }
}
