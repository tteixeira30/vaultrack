package com.tracky.auth;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.util.Comparator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Limita as tentativas nos endpoints públicos de autenticação, contra tentativas
 * repetidas de adivinhar credenciais e criação de contas em massa.
 *
 * Janelas fixas em memória (serve uma única instância do backend):
 * - login: N pedidos por IP e M falhas por email em 15 min (um login certo limpa as falhas do email);
 * - registo: K pedidos por IP numa hora.
 * Os limites vêm de {@code tracky.rate-limit.*}; o número de chaves guardadas é limitado.
 */
@Component
public class AuthRateLimiter {

    static final Duration LOGIN_WINDOW = Duration.ofMinutes(15);
    static final Duration REGISTER_WINDOW = Duration.ofHours(1);
    /** Teto de chaves por contador — a memória fica limitada mesmo com chaves sempre novas. */
    static final int MAX_KEYS = 10_000;

    private final boolean enabled;
    private final int loginPerIp;
    private final int loginFailuresPerEmail;
    private final int registerPerIp;
    private final Clock clock;

    private final Counter loginIp = new Counter(LOGIN_WINDOW);
    private final Counter loginEmail = new Counter(LOGIN_WINDOW);
    private final Counter registerIp = new Counter(REGISTER_WINDOW);

    @Autowired
    public AuthRateLimiter(@Value("${tracky.rate-limit.enabled:true}") boolean enabled,
                           @Value("${tracky.rate-limit.login-per-ip:20}") int loginPerIp,
                           @Value("${tracky.rate-limit.login-failures-per-email:5}") int loginFailuresPerEmail,
                           @Value("${tracky.rate-limit.register-per-ip:5}") int registerPerIp) {
        this(enabled, loginPerIp, loginFailuresPerEmail, registerPerIp, Clock.systemUTC());
    }

    /** Visível para testes — permite controlar o relógio. */
    AuthRateLimiter(boolean enabled, int loginPerIp, int loginFailuresPerEmail, int registerPerIp, Clock clock) {
        this.enabled = enabled;
        this.loginPerIp = loginPerIp;
        this.loginFailuresPerEmail = loginFailuresPerEmail;
        this.registerPerIp = registerPerIp;
        this.clock = clock;
    }

    /** Conta um pedido de login. Devolve os segundos de espera se estiver bloqueado; 0 se pode seguir. */
    public long tryLogin(String ip, String email) {
        if (!enabled) return 0;
        long now = clock.millis();
        long wait = loginIp.acquire(key(ip), loginPerIp, now);
        if (wait > 0) return wait;
        return loginEmail.blockedFor(key(email), loginFailuresPerEmail, now);
    }

    public void loginFailed(String email) {
        if (enabled) loginEmail.record(key(email), clock.millis());
    }

    public void loginSucceeded(String email) {
        if (enabled) loginEmail.reset(key(email));
    }

    /** Conta um pedido de registo. Devolve os segundos de espera se estiver bloqueado; 0 se pode seguir. */
    public long tryRegister(String ip) {
        if (!enabled) return 0;
        return registerIp.acquire(key(ip), registerPerIp, clock.millis());
    }

    /** Visível para testes. */
    int trackedKeys() {
        return loginIp.size() + loginEmail.size() + registerIp.size();
    }

    /** Visível para testes. */
    void purgeExpired() {
        long now = clock.millis();
        loginIp.purgeExpired(now);
        loginEmail.purgeExpired(now);
        registerIp.purgeExpired(now);
    }

    private static String key(String s) {
        return s == null || s.isBlank() ? "?" : s;
    }

    private record Bucket(long start, int count) {}

    /** Contador por chave numa janela fixa. */
    private static final class Counter {
        private final long windowMs;
        private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

        Counter(Duration window) {
            this.windowMs = window.toMillis();
        }

        /** Conta um pedido se ainda houver margem; devolve a espera (s) se já não houver. */
        long acquire(String key, int limit, long now) {
            long[] wait = {0};
            buckets.compute(key, (k, b) -> {
                if (b == null || expired(b, now)) b = new Bucket(now, 0);
                if (b.count() >= limit) {
                    wait[0] = secondsLeft(b, now);
                    return b;
                }
                return new Bucket(b.start(), b.count() + 1);
            });
            evictIfFull(now);
            return wait[0];
        }

        void record(String key, long now) {
            buckets.compute(key, (k, b) -> b == null || expired(b, now)
                    ? new Bucket(now, 1) : new Bucket(b.start(), b.count() + 1));
            evictIfFull(now);
        }

        long blockedFor(String key, int limit, long now) {
            Bucket b = buckets.get(key);
            if (b == null || expired(b, now) || b.count() < limit) return 0;
            return secondsLeft(b, now);
        }

        void reset(String key) {
            buckets.remove(key);
        }

        int size() {
            return buckets.size();
        }

        void purgeExpired(long now) {
            buckets.values().removeIf(b -> expired(b, now));
        }

        /** Acima do teto: sai o que já expirou e, se não chegar, as janelas mais antigas. */
        private synchronized void evictIfFull(long now) {
            if (buckets.size() <= MAX_KEYS) return;
            purgeExpired(now);
            int excess = buckets.size() - MAX_KEYS * 9 / 10;
            if (excess <= 0) return;
            buckets.entrySet().stream()
                    .sorted(Comparator.comparingLong(e -> e.getValue().start()))
                    .limit(excess)
                    .map(Map.Entry::getKey)
                    .toList()
                    .forEach(buckets::remove);
        }

        private boolean expired(Bucket b, long now) {
            return now - b.start() >= windowMs;
        }

        private long secondsLeft(Bucket b, long now) {
            long ms = b.start() + windowMs - now;
            return Math.max(1, (ms + 999) / 1000);
        }
    }
}
