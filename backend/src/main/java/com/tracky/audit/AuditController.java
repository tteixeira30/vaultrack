package com.tracky.audit;

import com.tracky.auth.User;
import com.tracky.auth.UserRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Leitura do trilho de auditoria: cada utilizador vê o seu ({@code /api/audit}); o admin vê o
 * de todos ({@code /api/admin/audit}, filtrável por {@code userId}). Paginação por cursor:
 * {@code before} é o id do último evento da página anterior.
 */
@RestController
public class AuditController {

    static final int DEFAULT_LIMIT = 50;
    static final int MAX_LIMIT = 100;

    private final AuditEventRepository repo;
    private final UserRepository userRepository;

    public AuditController(AuditEventRepository repo, UserRepository userRepository) {
        this.repo = repo;
        this.userRepository = userRepository;
    }

    public record EventDto(Long id, Instant occurredAt, Long userId, String userName, String userEmail,
                           String actor, String kind, String action, String entityType, Long entityId,
                           Map<String, Object> details, String ip, String userAgent) {}

    public record EventPage(List<EventDto> events, Long nextBefore) {}

    @GetMapping("/api/audit")
    public EventPage mine(@AuthenticationPrincipal User user,
                          @RequestParam(required = false) String kind,
                          @RequestParam(required = false) Long before,
                          @RequestParam(required = false) Integer limit) {
        int n = limit(limit);
        List<AuditEvent> rows = repo.findForUser(user.getId(), kind(kind), before, PageRequest.of(0, n + 1));
        return page(rows, n, e -> new EventDto(e.getId(), e.getOccurredAt(), e.getUserId(), null, null,
                e.getActor(), e.getKind(), e.getAction(), e.getEntityType(), e.getEntityId(),
                e.getDetails(), e.getIp(), e.getUserAgent()));
    }

    @GetMapping("/api/admin/audit")
    public EventPage all(@AuthenticationPrincipal User user,
                         @RequestParam(required = false) String kind,
                         @RequestParam(required = false) Long before,
                         @RequestParam(required = false) Integer limit,
                         @RequestParam(required = false) Long userId) {
        // o SecurityConfig já exige ROLE_ADMIN; verifica-se outra vez, para o caso de a regra mudar
        if (!user.isAdmin()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Sem permissão.");
        int n = limit(limit);
        List<AuditEvent> rows = repo.findForAdmin(userId, kind(kind), before, PageRequest.of(0, n + 1));
        Map<Long, User> users = userRepository.findAllById(rows.stream().map(AuditEvent::getUserId)
                        .filter(Objects::nonNull).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(User::getId, Function.identity()));
        return page(rows, n, e -> {
            User u = e.getUserId() == null ? null : users.get(e.getUserId());
            return new EventDto(e.getId(), e.getOccurredAt(), e.getUserId(),
                    u == null ? null : u.getName(), u == null ? null : u.getEmail(),
                    e.getActor(), e.getKind(), e.getAction(), e.getEntityType(), e.getEntityId(),
                    e.getDetails(), e.getIp(), e.getUserAgent());
        });
    }

    /** Pede-se limite + 1: se vier o extra, há mais páginas e o cursor é o último devolvido. */
    private static EventPage page(List<AuditEvent> rows, int limit, Function<AuditEvent, EventDto> map) {
        boolean more = rows.size() > limit;
        List<AuditEvent> shown = more ? rows.subList(0, limit) : rows;
        return new EventPage(shown.stream().map(map).toList(), more ? shown.get(shown.size() - 1).getId() : null);
    }

    private static int limit(Integer limit) {
        if (limit == null) return DEFAULT_LIMIT;
        return Math.max(1, Math.min(MAX_LIMIT, limit));
    }

    private static String kind(String kind) {
        if (kind == null || kind.isBlank()) return null;
        String k = kind.trim().toUpperCase(Locale.ROOT);
        for (AuditAction.Kind v : AuditAction.Kind.values()) {
            if (v.name().equals(k)) return k;
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Filtro inválido: usa security ou data.");
    }
}
