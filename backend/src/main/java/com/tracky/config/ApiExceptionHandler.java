package com.tracky.config;

import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.io.IOException;
import java.sql.SQLException;

/**
 * Converte em 400 PT-PT (sem detalhes técnicos) erros que o Spring tratava como
 * texto do Jackson ou como 500. Usa sendError para o /error continuar a montar o
 * corpo com {@code message} (ver ApiErrorAttributes).
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    static final String PEDIDO_INVALIDO = "Pedido inválido: verifica os valores introduzidos.";
    static final String VALOR_ENORME = "O valor introduzido é demasiado grande.";
    /** SQLState do Postgres para "numeric field overflow" (excede precision/scale da coluna). */
    private static final String NUMERIC_OVERFLOW = "22003";

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    public void pedidoInvalido(Exception e, HttpServletResponse res) throws IOException {
        log.debug("Pedido ilegível: {}", e.toString());
        res.sendError(400, PEDIDO_INVALIDO);
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public void integridade(DataIntegrityViolationException e, HttpServletResponse res) throws IOException {
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof SQLException sql && NUMERIC_OVERFLOW.equals(sql.getSQLState())) {
                res.sendError(400, VALOR_ENORME);
                return;
            }
            if (t.getCause() == t) break;
        }
        throw e; // restantes violações continuam a ser 500 genérico
    }
}
