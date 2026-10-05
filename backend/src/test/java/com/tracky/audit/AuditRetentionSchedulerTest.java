package com.tracky.audit;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class AuditRetentionSchedulerTest {

    private final AuditEventRepository repo = mock(AuditEventRepository.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-10-05T03:30:00Z"), ZoneOffset.UTC);

    @Test
    void apagaOQueTemMaisDoQueARetencao() {
        new AuditRetentionScheduler(repo, 365, clock).purge();
        verify(repo).deleteOlderThan(Instant.parse("2025-10-05T03:30:00Z"));
    }

    @Test
    void retencaoZeroNaoApagaNada() {
        new AuditRetentionScheduler(repo, 0, clock).purge();
        verify(repo, never()).deleteOlderThan(any());
    }
}
