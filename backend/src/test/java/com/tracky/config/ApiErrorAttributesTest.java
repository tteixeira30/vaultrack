package com.tracky.config;

import jakarta.servlet.RequestDispatcher;
import org.junit.jupiter.api.Test;
import org.springframework.boot.web.error.ErrorAttributeOptions;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.validation.BindException;
import org.springframework.validation.FieldError;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * O corpo de erro do /error: um 500 nunca leva a mensagem da exceção; os 4xx
 * mantêm a mensagem para o utilizador (o api.js mostra o campo "message").
 */
class ApiErrorAttributesTest {

    private final ApiErrorAttributes attrs = new ApiErrorAttributes();
    private final ErrorAttributeOptions withMessage =
            ErrorAttributeOptions.defaults().including(ErrorAttributeOptions.Include.MESSAGE);

    private Map<String, Object> errorBody(int status, Throwable error, String message) {
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/goals");
        req.setAttribute(RequestDispatcher.ERROR_STATUS_CODE, status);
        req.setAttribute(RequestDispatcher.ERROR_REQUEST_URI, "/api/goals");
        if (error != null) req.setAttribute(RequestDispatcher.ERROR_EXCEPTION, error);
        if (message != null) req.setAttribute(RequestDispatcher.ERROR_MESSAGE, message);
        return attrs.getErrorAttributes(new ServletWebRequest(req), withMessage);
    }

    @Test
    void erro500TemMensagemGenericaSemDetalhesInternos() {
        var ex = new IllegalStateException("could not execute statement; SQL [insert into goal ...]");
        Map<String, Object> body = errorBody(500, ex, ex.getMessage());

        assertThat(body.get("status")).isEqualTo(500);
        assertThat(body.get("message")).isEqualTo("Erro interno. Tenta novamente.");
        assertThat(body.toString()).doesNotContain("SQL").doesNotContain("IllegalStateException");
        assertThat(body).doesNotContainKeys("trace", "exception");
    }

    @Test
    void erro500SemExcecaoTambemFicaGenerico() {
        Map<String, Object> body = errorBody(500, null, "detalhe interno");
        assertThat(body.get("message")).isEqualTo("Erro interno. Tenta novamente.");
    }

    @Test
    void erro4xxMantemAMensagemParaOUtilizador() {
        var ex = new ResponseStatusException(HttpStatus.BAD_REQUEST, "O valor do objetivo tem de ser positivo.");
        Map<String, Object> body = errorBody(400, ex, "O valor do objetivo tem de ser positivo.");
        assertThat(body.get("message")).isEqualTo("O valor do objetivo tem de ser positivo.");
    }

    @Test
    void erroDeValidacaoMostraAMensagemDoCampo() {
        var br = new BeanPropertyBindingResult(new Object(), "registerRequest");
        br.addError(new FieldError("registerRequest", "password",
                "A palavra-passe deve ter pelo menos 8 caracteres."));
        Map<String, Object> body = errorBody(400, new BindException(br), null);
        assertThat(body.get("message")).isEqualTo("A palavra-passe deve ter pelo menos 8 caracteres.");
    }
}
