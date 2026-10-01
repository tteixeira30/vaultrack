package com.tracky.auth;

import com.tracky.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Limitação de tentativas no login/registo, com os limites estritos ligados
 * (o perfil de teste desliga-os para os restantes testes de integração).
 * Cada teste usa um IP próprio para não partilhar contadores.
 */
@TestPropertySource(properties = {
        "tracky.rate-limit.enabled=true",
        "tracky.rate-limit.login-per-ip=20",
        "tracky.rate-limit.login-failures-per-email=5",
        "tracky.rate-limit.register-per-ip=5"
})
class AuthRateLimitIntegrationTest extends AbstractIntegrationTest {

    private static final AtomicInteger NEXT_IP = new AtomicInteger(1);

    @Autowired MockMvc mvc;

    private static String newIp() {
        return "10.99.0." + NEXT_IP.getAndIncrement();
    }

    private ResultActions register(String ip, String email) throws Exception {
        return mvc.perform(post("/api/auth/register")
                .with(r -> { r.setRemoteAddr(ip); return r; })
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"name":"Teste","email":"%s","password":"segredo123"}
                        """.formatted(email)));
    }

    private ResultActions login(String ip, String email, String password) throws Exception {
        return mvc.perform(post("/api/auth/login")
                .with(r -> { r.setRemoteAddr(ip); return r; })
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"email":"%s","password":"%s"}
                        """.formatted(email, password)));
    }

    private static String email() {
        return "rl-" + UUID.randomUUID() + "@test.pt";
    }

    @Test
    void cincoFalhasBloqueiamOEmailCom429ERetryAfter() throws Exception {
        String ip = newIp();
        String email = email();
        register(ip, email).andExpect(status().isOk());

        for (int i = 0; i < 5; i++) {
            login(ip, email, "errada999").andExpect(status().isUnauthorized());
        }
        // mesmo com a palavra-passe certa: o email está bloqueado até ao fim da janela
        login(ip, "  " + email.toUpperCase() + " ", "segredo123")
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", "900"))
                .andExpect(jsonPath("$.message")
                        .value("Demasiadas tentativas. Tenta novamente daqui a alguns minutos."));
    }

    @Test
    void loginCertoLimpaAsFalhasAnteriores() throws Exception {
        String ip = newIp();
        String email = email();
        register(ip, email).andExpect(status().isOk());

        for (int i = 0; i < 4; i++) login(ip, email, "errada999").andExpect(status().isUnauthorized());
        login(ip, email, "segredo123").andExpect(status().isOk());
        for (int i = 0; i < 4; i++) login(ip, email, "errada999").andExpect(status().isUnauthorized());
        login(ip, email, "segredo123").andExpect(status().isOk());
    }

    @Test
    void registoAcimaDoLimitePorIpDevolve429() throws Exception {
        String ip = newIp();
        for (int i = 0; i < 5; i++) register(ip, email()).andExpect(status().isOk());
        register(ip, email())
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"))
                .andExpect(jsonPath("$.message").exists());
        // outro IP continua a poder registar
        register(newIp(), email()).andExpect(status().isOk());
    }
}
