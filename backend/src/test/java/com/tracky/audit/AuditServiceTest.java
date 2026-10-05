package com.tracky.audit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import com.tracky.config.RequestLogFilter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/** O AuditService: contexto do pedido, diff dos campos e nunca lançar exceções. */
class AuditServiceTest {

    private final List<Object> published = new ArrayList<>();
    private final AuditService audit = new AuditService(published::add);

    @AfterEach
    void limpa() {
        RequestContextHolder.resetRequestAttributes();
    }

    private AuditRecord last() {
        return (AuditRecord) published.get(published.size() - 1);
    }

    @Test
    void comPedidoHttpCapturaIpUserAgentERequestId() {
        var req = new MockHttpServletRequest("POST", "/api/goals");
        req.setRemoteAddr("203.0.113.9");
        req.addHeader("User-Agent", "x".repeat(300));
        req.setAttribute(RequestLogFilter.REQUEST_ID_ATTR, "1a2b3c4d");
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(req));

        audit.security(AuditAction.LOGIN_SUCCEEDED, 7L, null);

        AuditRecord r = last();
        assertThat(r.actor()).isEqualTo("USER");
        assertThat(r.kind()).isEqualTo("SECURITY");
        assertThat(r.action()).isEqualTo("LOGIN_SUCCEEDED");
        assertThat(r.ip()).isEqualTo("203.0.113.9");
        assertThat(r.userAgent()).hasSize(255);
        assertThat(r.requestId()).isEqualTo("1a2b3c4d");
        assertThat(r.details()).isNull();
    }

    @Test
    void semPedidoHttpOAtorESystem() {
        audit.record(7L, AuditAction.CONTRIBUTIONS_APPLIED, null, null, AuditService.fields("total", BigDecimal.TEN));
        assertThat(last().actor()).isEqualTo("SYSTEM");
        assertThat(last().ip()).isNull();
        assertThat(last().kind()).isEqualTo("DATA");
    }

    @Test
    void updatedSoRegistaOsCamposQueMudaram() {
        audit.updated(1L, AuditEntity.GOAL, 3L, "Férias",
                AuditService.fields("name", "Férias", "targetAmount", new BigDecimal("1000"), "day", 1),
                AuditService.fields("name", "Férias", "targetAmount", new BigDecimal("1000.00"), "day", 5));

        Map<String, Object> d = last().details();
        assertThat(d.get("label")).isEqualTo("Férias");
        // 1000 e 1000.00 são o mesmo montante (compareTo, não equals)
        @SuppressWarnings("unchecked")
        Map<String, Object> changes = (Map<String, Object>) d.get("changes");
        assertThat(changes).containsOnlyKeys("day");
        assertThat(changes.get("day")).isEqualTo(List.of(1, 5));
    }

    @Test
    void updatedSemMudancasNaoGeraEvento() {
        audit.updated(1L, AuditEntity.GOAL, 3L, "x", AuditService.fields("a", null), AuditService.fields("a", null));
        assertThat(published).isEmpty();
    }

    @Test
    void fieldsNormalizaDatasEnumsETrunca() {
        Map<String, Object> m = AuditService.fields("d", LocalDate.of(2026, 10, 5), "m", YearMonth.of(2026, 10),
                "e", AuditEntity.GOAL, "s", "y".repeat(500), "n", null);
        assertThat(m.get("d")).isEqualTo("2026-10-05");
        assertThat(m.get("m")).isEqualTo("2026-10");
        assertThat(m.get("e")).isEqualTo("GOAL");
        assertThat((String) m.get("s")).hasSize(AuditService.MAX_STRING);
        assertThat(m).containsKey("n");
    }

    @Test
    void nuncaLancaMesmoQueOPublicadorFalhe() {
        AuditService failing = new AuditService(e -> { throw new IllegalStateException("x"); });
        assertThatCode(() -> failing.created(1L, AuditEntity.GOAL, 1L, "a", Map.of())).doesNotThrowAnyException();
    }
}
