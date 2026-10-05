package com.tracky.config;

import jakarta.servlet.DispatcherType;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerMapping;

import java.io.IOException;
import java.util.HexFormat;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Correlação e registo dos pedidos.
 *
 * Cada pedido ganha um id curto ({@code requestId}). O id vai para o MDC, e assim todas
 * as linhas de log do pedido o levam. Vai também para o header {@code X-Request-Id} e
 * para um atributo do pedido. É esse atributo que o dispatch de /error lê: o Tomcat só
 * lá chega depois de este filtro ter terminado e limpo o MDC. O id é sempre gerado aqui
 * — um {@code X-Request-Id} vindo do cliente é ignorado.
 *
 * No fim escreve uma linha por pedido (logger {@code tracky.http}): método, rota-padrão
 * (ex.: /api/goals/{id}, nunca a query string), status e duração. O {@code userId}
 * chega ao MDC pelo JwtAuthFilter.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestLogFilter extends OncePerRequestFilter {

    /** Chaves do MDC (campos próprios nos logs JSON de produção). */
    public static final String REQUEST_ID = "requestId";
    public static final String USER_ID = "userId";
    /** Atributos do pedido: sobrevivem até ao dispatch de /error, ao contrário do MDC. */
    public static final String REQUEST_ID_ATTR = RequestLogFilter.class.getName() + ".requestId";
    public static final String USER_ID_ATTR = RequestLogFilter.class.getName() + ".userId";
    public static final String HEADER = "X-Request-Id";

    private static final int MAX_ROUTE = 200;
    private static final Logger log = LoggerFactory.getLogger("tracky.http");

    /** O /error também precisa do contexto: é lá que se escreve o log e o corpo dos 5xx. */
    @Override
    protected boolean shouldNotFilterErrorDispatch() {
        return false;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        if (req.getDispatcherType() == DispatcherType.ERROR) {
            // o pedido original já foi registado; só se repõe o contexto para o /error
            restore(req);
            try {
                chain.doFilter(req, res);
            } finally {
                clear();
            }
            return;
        }

        String id = HexFormat.of().toHexDigits(ThreadLocalRandom.current().nextInt());
        req.setAttribute(REQUEST_ID_ATTR, id);
        res.setHeader(HEADER, id);
        MDC.put(REQUEST_ID, id);
        long start = System.nanoTime();
        // uma exceção que escape ainda não é resposta nenhuma: o Tomcat transforma-a em 500 depois
        int status = 500;
        try {
            chain.doFilter(req, res);
            status = res.getStatus();
        } finally {
            log.info("{} {} {} {}ms", req.getMethod(), route(req), status, (System.nanoTime() - start) / 1_000_000);
            clear();
        }
    }

    /** A rota-padrão do handler; sem handler (401 do Security, 404) fica o caminho, truncado. */
    private static String route(HttpServletRequest req) {
        Object pattern = req.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
        String route = pattern != null ? pattern.toString() : req.getRequestURI();
        return route.length() > MAX_ROUTE ? route.substring(0, MAX_ROUTE) : route;
    }

    private static void restore(HttpServletRequest req) {
        Object id = req.getAttribute(REQUEST_ID_ATTR);
        if (id != null) MDC.put(REQUEST_ID, id.toString());
        Object user = req.getAttribute(USER_ID_ATTR);
        if (user != null) MDC.put(USER_ID, user.toString());
    }

    private static void clear() {
        MDC.remove(REQUEST_ID);
        MDC.remove(USER_ID);
    }
}
