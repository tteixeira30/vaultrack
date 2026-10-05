package com.tracky.audit;

import java.time.Instant;
import java.util.Map;

/**
 * Evento de auditoria em trânsito: o {@link AuditService} publica-o (com o contexto do
 * pedido já capturado) e o {@link AuditWriter} grava-o depois do commit.
 */
public record AuditRecord(Instant occurredAt, Long userId, String actor, String kind, String action,
                          String entityType, Long entityId, Map<String, Object> details,
                          String ip, String userAgent, String requestId) {}
