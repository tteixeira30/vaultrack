package com.tracky.audit;

import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Uma falha a gravar a auditoria fica no log; nunca chega ao pedido. */
class AuditWriterTest {

    private static AuditRecord record() {
        return new AuditRecord(Instant.now(), 1L, "USER", "DATA", "CREATED", "GOAL", 1L, null, null, null, null);
    }

    @Test
    void repositorioAFalharNaoLanca() {
        AuditEventRepository repo = mock(AuditEventRepository.class);
        when(repo.save(any())).thenThrow(new IllegalStateException("BD em baixo"));
        PlatformTransactionManager tx = mock(PlatformTransactionManager.class);
        when(tx.getTransaction(any())).thenReturn(new SimpleTransactionStatus());

        assertThatCode(() -> new AuditWriter(repo, tx).on(record())).doesNotThrowAnyException();
    }

    @Test
    void falhaNoCommitNaoLanca() {
        AuditEventRepository repo = mock(AuditEventRepository.class);
        PlatformTransactionManager tx = mock(PlatformTransactionManager.class);
        when(tx.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        org.mockito.Mockito.doThrow(new IllegalStateException("commit")).when(tx).commit(any());

        assertThatCode(() -> new AuditWriter(repo, tx).on(record())).doesNotThrowAnyException();
    }
}
