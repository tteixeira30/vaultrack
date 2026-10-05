package com.tracky.config;

import com.tracky.auth.User;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Erros do frontend (exceções não apanhadas, ErrorBoundary), para ficarem no mesmo log
 * que os do servidor — com o requestId e o userId do pedido que os traz.
 *
 * Autenticado e limitado a {@value #PER_MINUTE} relatórios por minuto e utilizador:
 * um ciclo de erros no browser não pode encher o log. Acima disso responde 204 na mesma
 * (não há nada que o cliente possa fazer com um erro) e descarta.
 */
@RestController
public class ClientErrorController {

    static final int PER_MINUTE = 10;
    private static final int MAX_USERS = 10_000;
    private static final Logger log = LoggerFactory.getLogger("tracky.client");

    public record ClientErrorRequest(@Size(max = 2000, message = "Mensagem demasiado longa.") String message,
                                     @Size(max = 10000, message = "Stack demasiado longa.") String stack,
                                     @Size(max = 64, message = "Versão inválida.") String version,
                                     @Size(max = 20, message = "Plataforma inválida.") String platform,
                                     @Size(max = 40, message = "Ecrã inválido.") String screen) {}

    /** [início do minuto, contagem] por utilizador. */
    private final Map<Long, long[]> windows = new ConcurrentHashMap<>();

    @PostMapping("/api/client-errors")
    public ResponseEntity<Void> report(@AuthenticationPrincipal User user, @Valid @RequestBody ClientErrorRequest req) {
        if (allowed(user.getId(), System.currentTimeMillis())) {
            log.warn("Erro no cliente [{} {}] em {}: {}\n{}", oneLine(req.platform(), 20), oneLine(req.version(), 64),
                    oneLine(req.screen(), 40), oneLine(req.message(), 500), truncate(req.stack(), 4000));
        }
        return ResponseEntity.status(HttpStatus.NO_CONTENT).build();
    }

    boolean allowed(long userId, long now) {
        if (windows.size() > MAX_USERS) windows.clear();
        long minute = now / 60_000;
        long[] w = windows.compute(userId, (k, v) -> v == null || v[0] != minute ? new long[]{minute, 1} : new long[]{minute, v[1] + 1});
        return w[1] <= PER_MINUTE;
    }

    /** Uma linha só: o cliente escolhe este texto, não pode inventar linhas de log. */
    private static String oneLine(String s, int max) {
        return s == null ? "-" : truncate(s.replaceAll("[\\r\\n\\t]+", " "), max);
    }

    private static String truncate(String s, int max) {
        return s == null ? "" : s.length() <= max ? s : s.substring(0, max) + "…";
    }
}
