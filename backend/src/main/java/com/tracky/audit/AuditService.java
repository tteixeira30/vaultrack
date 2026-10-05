package com.tracky.audit;

import com.tracky.config.RequestLogFilter;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.TemporalAccessor;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

/**
 * Regista eventos de auditoria. Captura o contexto no momento da chamada (IP, user agent,
 * requestId; sem pedido HTTP o ator é SYSTEM) e publica um {@link AuditRecord}, que o
 * {@link AuditWriter} grava depois do commit — um rollback não deixa evento.
 *
 * Nunca lança exceções: a auditoria não pode fazer falhar o pedido que audita.
 *
 * Os controllers recebem-no por setter e usam {@link #NOOP} por omissão, para os testes
 * unitários que fazem {@code new XController(...)} não precisarem de o passar.
 */
@Service
public class AuditService {

    /** Não regista nada. É o valor por omissão nos controllers fora do Spring. */
    public static final AuditService NOOP = new AuditService(e -> {});

    static final int MAX_STRING = 120;
    private static final int MAX_IP = 45;
    private static final int MAX_USER_AGENT = 255;

    private static final Logger log = LoggerFactory.getLogger(AuditService.class);

    private final ApplicationEventPublisher publisher;

    public AuditService(ApplicationEventPublisher publisher) {
        this.publisher = publisher;
    }

    /** Evento de segurança (entrada, registo, limite de tentativas). {@code userId} pode ser nulo. */
    public void security(AuditAction action, Long userId, Map<String, Object> details) {
        record(userId, action, null, null, details);
    }

    public void created(Long userId, AuditEntity type, Long id, String label, Map<String, Object> values) {
        record(userId, AuditAction.CREATED, type, id, withLabel(label, "values", values));
    }

    /** Só regista se algum campo mudou. */
    public void updated(Long userId, AuditEntity type, Long id, String label,
                        Map<String, Object> before, Map<String, Object> after) {
        Map<String, Object> changes = diff(before, after);
        if (changes.isEmpty()) return;
        record(userId, AuditAction.UPDATED, type, id, withLabel(label, "changes", changes));
    }

    public void deleted(Long userId, AuditEntity type, Long id, String label, Map<String, Object> values) {
        record(userId, AuditAction.DELETED, type, id, withLabel(label, "values", values));
    }

    public void record(Long userId, AuditAction action, AuditEntity type, Long id, Map<String, Object> details) {
        try {
            String actor = "SYSTEM";
            String ip = null;
            String userAgent = null;
            String requestId = null;
            if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes sra) {
                HttpServletRequest req = sra.getRequest();
                actor = "USER";
                ip = truncate(req.getRemoteAddr(), MAX_IP);
                userAgent = truncate(req.getHeader("User-Agent"), MAX_USER_AGENT);
                Object rid = req.getAttribute(RequestLogFilter.REQUEST_ID_ATTR);
                requestId = rid == null ? null : rid.toString();
            }
            publisher.publishEvent(new AuditRecord(Instant.now(), userId, actor, action.kind().name(),
                    action.name(), type == null ? null : type.name(), id,
                    details == null || details.isEmpty() ? null : details, ip, userAgent, requestId));
        } catch (RuntimeException e) {
            log.error("Falha a registar o evento de auditoria {} {}", action, type, e);
        }
    }

    /**
     * Mapa de campos para os {@code details}, a partir de pares chave/valor. Normaliza os
     * valores: datas, meses e enums passam a texto; texto é truncado a {@value #MAX_STRING};
     * BigDecimal mantém-se (os montantes são sempre em EUR).
     */
    public static Map<String, Object> fields(Object... keyValues) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i + 1 < keyValues.length; i += 2) {
            m.put(String.valueOf(keyValues[i]), normalize(keyValues[i + 1]));
        }
        return m;
    }

    static Map<String, Object> diff(Map<String, Object> before, Map<String, Object> after) {
        Map<String, Object> changes = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : after.entrySet()) {
            Object old = before.get(e.getKey());
            if (!same(old, e.getValue())) changes.put(e.getKey(), Arrays.asList(old, e.getValue()));
        }
        return changes;
    }

    private static boolean same(Object a, Object b) {
        if (a instanceof BigDecimal x && b instanceof BigDecimal y) return x.compareTo(y) == 0;
        return Objects.equals(a, b);
    }

    private static Object normalize(Object v) {
        if (v instanceof String s) return truncate(s, MAX_STRING);
        if (v instanceof Enum<?> e) return e.name();
        if (v instanceof TemporalAccessor) return v.toString(); // LocalDate, YearMonth, Instant
        return v;
    }

    private static Map<String, Object> withLabel(String label, String key, Map<String, Object> body) {
        Map<String, Object> d = new LinkedHashMap<>();
        if (label != null) d.put("label", truncate(label, MAX_STRING));
        if (body != null && !body.isEmpty()) d.put(key, body);
        return d;
    }

    private static String truncate(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }
}
