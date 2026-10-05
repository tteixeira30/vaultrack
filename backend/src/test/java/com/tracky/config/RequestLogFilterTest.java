package com.tracky.config;

import jakarta.servlet.DispatcherType;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.slf4j.MDC;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.servlet.HandlerMapping;

import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Correlação dos pedidos: MDC, header, atributo e a linha por pedido. */
@ExtendWith(OutputCaptureExtension.class)
class RequestLogFilterTest {

    private final RequestLogFilter filter = new RequestLogFilter();

    @AfterEach
    void limpaMdc() {
        MDC.clear();
    }

    @Test
    void poeORequestIdNoMdcDuranteACadeiaELimpaNoFim(CapturedOutput out) throws Exception {
        var req = new MockHttpServletRequest("GET", "/api/goals/7");
        req.setAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE, "/api/goals/{id}");
        req.addHeader(RequestLogFilter.HEADER, "do-cliente");
        var res = new MockHttpServletResponse();
        AtomicReference<String> noMdc = new AtomicReference<>();

        FilterChain chain = (rq, rs) -> {
            noMdc.set(MDC.get(RequestLogFilter.REQUEST_ID));
            ((MockHttpServletResponse) rs).setStatus(201);
        };
        filter.doFilter(req, res, chain);

        String id = res.getHeader(RequestLogFilter.HEADER);
        assertThat(id).matches("[0-9a-f]{8}");
        assertThat(noMdc.get()).isEqualTo(id);
        assertThat(req.getAttribute(RequestLogFilter.REQUEST_ID_ATTR)).isEqualTo(id);
        assertThat(MDC.get(RequestLogFilter.REQUEST_ID)).isNull();
        assertThat(out).contains("GET /api/goals/{id} 201");
    }

    @Test
    void naoEscreveAQueryString(CapturedOutput out) throws Exception {
        var req = new MockHttpServletRequest("GET", "/api/calendar");
        req.setQueryString("month=2026-10");
        filter.doFilter(req, new MockHttpServletResponse(), (rq, rs) -> {});

        assertThat(out).contains("GET /api/calendar 200").doesNotContain("month=");
    }

    @Test
    void excecaoFicaRegistadaComo500ESegueEmFrente(CapturedOutput out) {
        var req = new MockHttpServletRequest("POST", "/api/goals");
        FilterChain chain = (rq, rs) -> { throw new IllegalStateException("rebentou"); };

        assertThatThrownBy(() -> filter.doFilter(req, new MockHttpServletResponse(), chain))
                .isInstanceOf(IllegalStateException.class);
        assertThat(out).contains("POST /api/goals 500");
        assertThat(MDC.get(RequestLogFilter.REQUEST_ID)).isNull();
    }

    @Test
    void dispatchDeErroRepoeOContextoSemNovoIdNemNovaLinha(CapturedOutput out) throws Exception {
        var req = new MockHttpServletRequest("GET", "/error");
        req.setDispatcherType(DispatcherType.ERROR);
        req.setAttribute(RequestLogFilter.REQUEST_ID_ATTR, "abcd1234");
        req.setAttribute(RequestLogFilter.USER_ID_ATTR, 42L);
        var res = new MockHttpServletResponse();
        AtomicReference<String> id = new AtomicReference<>();
        AtomicReference<String> user = new AtomicReference<>();

        filter.doFilter(req, res, (rq, rs) -> {
            id.set(MDC.get(RequestLogFilter.REQUEST_ID));
            user.set(MDC.get(RequestLogFilter.USER_ID));
        });

        assertThat(id.get()).isEqualTo("abcd1234");
        assertThat(user.get()).isEqualTo("42");
        assertThat(res.getHeader(RequestLogFilter.HEADER)).isNull();
        assertThat(out).doesNotContain("/error");
        assertThat(MDC.get(RequestLogFilter.REQUEST_ID)).isNull();
        assertThat(MDC.get(RequestLogFilter.USER_ID)).isNull();
    }
}
