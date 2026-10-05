package com.tracky.config;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ClientErrorControllerTest {

    @Test
    void limitaPorMinutoEPorUtilizador() {
        var c = new ClientErrorController();
        long t = 1_000_000_000L;
        for (int i = 0; i < ClientErrorController.PER_MINUTE; i++) assertThat(c.allowed(1L, t)).isTrue();
        assertThat(c.allowed(1L, t)).isFalse();
        // outro utilizador tem a sua própria quota; o minuto seguinte recomeça
        assertThat(c.allowed(2L, t)).isTrue();
        assertThat(c.allowed(1L, t + 60_000)).isTrue();
    }
}
