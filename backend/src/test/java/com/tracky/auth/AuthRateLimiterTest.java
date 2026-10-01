package com.tracky.auth;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

/** Limites estritos (os de produção) com um relógio controlado pelo teste. */
class AuthRateLimiterTest {

    /** Relógio que o teste faz avançar. */
    static final class MutableClock extends Clock {
        private Instant now = Instant.parse("2026-10-01T10:00:00Z");
        void advance(Duration d) { now = now.plus(d); }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }

    private final MutableClock clock = new MutableClock();

    private AuthRateLimiter strict() {
        return new AuthRateLimiter(true, 20, 5, 5, clock);
    }

    @Test
    void bloqueiaOEmailAoFimDeCincoFalhasEDizQuantoEsperar() {
        var rl = strict();
        for (int i = 0; i < 5; i++) {
            assertThat(rl.tryLogin("1.1.1.1", "ana@ex.com")).isZero();
            rl.loginFailed("ana@ex.com");
        }
        long wait = rl.tryLogin("1.1.1.1", "ana@ex.com");
        assertThat(wait).isEqualTo(15 * 60);

        // outro email do mesmo IP não é afetado pelo bloqueio do primeiro
        assertThat(rl.tryLogin("1.1.1.1", "rui@ex.com")).isZero();
    }

    @Test
    void bloqueioDoEmailExpiraAoFimDaJanela() {
        var rl = strict();
        for (int i = 0; i < 5; i++) {
            rl.tryLogin("1.1.1.1", "ana@ex.com");
            rl.loginFailed("ana@ex.com");
        }
        clock.advance(Duration.ofMinutes(10));
        assertThat(rl.tryLogin("1.1.1.1", "ana@ex.com")).isEqualTo(5 * 60);
        clock.advance(Duration.ofMinutes(5));
        assertThat(rl.tryLogin("1.1.1.1", "ana@ex.com")).isZero();
    }

    @Test
    void loginComSucessoLimpaAsFalhasDoEmail() {
        var rl = strict();
        for (int i = 0; i < 4; i++) rl.loginFailed("ana@ex.com");
        rl.loginSucceeded("ana@ex.com");
        for (int i = 0; i < 4; i++) rl.loginFailed("ana@ex.com");
        assertThat(rl.tryLogin("1.1.1.1", "ana@ex.com")).isZero();
    }

    @Test
    void limitaOsPedidosDeLoginPorIp() {
        var rl = strict();
        for (int i = 0; i < 20; i++) {
            assertThat(rl.tryLogin("2.2.2.2", "u" + i + "@ex.com")).isZero();
        }
        assertThat(rl.tryLogin("2.2.2.2", "outro@ex.com")).isPositive();
        assertThat(rl.tryLogin("3.3.3.3", "outro@ex.com")).isZero();
    }

    @Test
    void limitaORegistoACincoPorHoraPorIp() {
        var rl = strict();
        for (int i = 0; i < 5; i++) assertThat(rl.tryRegister("4.4.4.4")).isZero();
        assertThat(rl.tryRegister("4.4.4.4")).isEqualTo(60 * 60);
        clock.advance(Duration.ofHours(1));
        assertThat(rl.tryRegister("4.4.4.4")).isZero();
    }

    @Test
    void desligadoNuncaBloqueia() {
        var rl = new AuthRateLimiter(false, 20, 5, 5, clock);
        for (int i = 0; i < 50; i++) {
            rl.loginFailed("ana@ex.com");
            assertThat(rl.tryLogin("1.1.1.1", "ana@ex.com")).isZero();
            assertThat(rl.tryRegister("1.1.1.1")).isZero();
        }
    }

    @Test
    void memoriaLimitada_entradasExpiradasEExcedentesSaoDescartadas() {
        var rl = strict();
        for (int i = 0; i < AuthRateLimiter.MAX_KEYS + 500; i++) rl.loginFailed("u" + i + "@ex.com");
        assertThat(rl.trackedKeys()).isLessThanOrEqualTo(AuthRateLimiter.MAX_KEYS);

        clock.advance(Duration.ofHours(2));
        rl.loginFailed("novo@ex.com");
        rl.purgeExpired();
        assertThat(rl.trackedKeys()).isEqualTo(1);
    }
}
