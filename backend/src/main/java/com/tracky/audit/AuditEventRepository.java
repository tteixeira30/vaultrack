package com.tracky.audit;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

public interface AuditEventRepository extends JpaRepository<AuditEvent, Long> {

    /** Os eventos de um utilizador. O userId é obrigatório: um nulo nunca pode listar toda a gente. */
    @Query("""
            select e from AuditEvent e
            where e.userId = :userId
              and (:kind is null or e.kind = :kind)
              and (:before is null or e.id < :before)
            order by e.id desc""")
    List<AuditEvent> findForUser(@Param("userId") long userId, @Param("kind") String kind,
                                 @Param("before") Long before, Pageable page);

    /** Vista do admin: todos os utilizadores, ou um só com {@code userId}. */
    @Query("""
            select e from AuditEvent e
            where (:userId is null or e.userId = :userId)
              and (:kind is null or e.kind = :kind)
              and (:before is null or e.id < :before)
            order by e.id desc""")
    List<AuditEvent> findForAdmin(@Param("userId") Long userId, @Param("kind") String kind,
                                  @Param("before") Long before, Pageable page);

    List<AuditEvent> findByRequestId(String requestId);

    /** Query nativa: um DELETE em HQL sobre uma entidade @Immutable dá o aviso HHH. */
    @Modifying
    @Transactional
    @Query(value = "delete from audit_events where occurred_at < :cutoff", nativeQuery = true)
    int deleteOlderThan(@Param("cutoff") Instant cutoff);
}
