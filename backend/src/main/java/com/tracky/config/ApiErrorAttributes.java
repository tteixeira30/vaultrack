package com.tracky.config;

import jakarta.servlet.RequestDispatcher;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.web.error.ErrorAttributeOptions;
import org.springframework.boot.web.servlet.error.DefaultErrorAttributes;
import org.springframework.stereotype.Component;
import org.springframework.validation.BindingResult;
import org.springframework.validation.ObjectError;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.WebRequest;

import java.util.Map;

/**
 * Corpo das respostas de erro do /error (o {@code message} que o api.js mostra).
 *
 * - 5xx: mensagem genérica — a mensagem da exceção pode trazer detalhes internos
 *   (SQL, classes, caminhos) e não sai do servidor; fica só no log.
 * - Erros de validação (@Valid): a mensagem do primeiro campo inválido, em vez do
 *   resumo técnico do Spring, para o utilizador ver o texto PT-PT da anotação.
 * - Restantes 4xx: inalterados (motivo do ResponseStatusException).
 */
@Component
public class ApiErrorAttributes extends DefaultErrorAttributes {

    static final String GENERIC_500 = "Erro interno. Tenta novamente.";

    private static final Logger log = LoggerFactory.getLogger(ApiErrorAttributes.class);

    @Override
    public Map<String, Object> getErrorAttributes(WebRequest request, ErrorAttributeOptions options) {
        Map<String, Object> attrs = super.getErrorAttributes(request, options);
        Throwable error = getError(request);
        Object code = request.getAttribute(RequestDispatcher.ERROR_STATUS_CODE, RequestAttributes.SCOPE_REQUEST);
        int status = code instanceof Integer s ? s : 500;

        if (status >= 500) {
            log.error("Erro {} em {}", status,
                    request.getAttribute(RequestDispatcher.ERROR_REQUEST_URI, RequestAttributes.SCOPE_REQUEST), error);
            attrs.put("message", GENERIC_500);
            attrs.remove("exception");
            attrs.remove("trace");
            attrs.remove("errors");
        } else if (error instanceof BindingResult br && br.hasErrors()
                && options.isIncluded(ErrorAttributeOptions.Include.MESSAGE)) {
            ObjectError first = br.hasFieldErrors() ? br.getFieldErrors().get(0) : br.getAllErrors().get(0);
            String msg = first.getDefaultMessage();
            if (msg != null && !msg.isBlank()) attrs.put("message", msg);
        }
        return attrs;
    }
}
