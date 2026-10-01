package com.tracky.auth;

import com.tracky.TestSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Testa a lógica de registo/login/moeda do AuthController com colaboradores
 * mockados (sem contexto Spring nem BD). O gate de convite, a normalização de
 * email e os códigos de estado (409/401/403/400) são o foco.
 */
@ExtendWith(MockitoExtension.class)
class AuthControllerTest {

    @Mock UserRepository userRepository;
    @Mock PasswordEncoder passwordEncoder;
    @Mock JwtService jwtService;

    private static final MockHttpServletRequest HTTP = new MockHttpServletRequest();

    private AuthController controller(String inviteCode) {
        return new AuthController(userRepository, passwordEncoder, jwtService, inviteCode,
                new AuthRateLimiter(true, 20, 5, 5, Clock.systemUTC()));
    }

    private User savedUser(long id, String email) {
        User u = new User();
        u.setName("Ana");
        u.setEmail(email);
        u.setPasswordHash("hash");
        TestSupport.setId(u, id);
        return u;
    }

    @BeforeEach
    void stubDefaults() {
        lenient().when(jwtService.generate(anyLong())).thenReturn("jwt-token");
    }

    // ---------- register ----------

    @Test
    void registoAbertoCriaUtilizadorEDevolveToken() {
        var c = controller(""); // sem código de convite
        when(userRepository.existsByEmail("ana@ex.com")).thenReturn(false);
        when(passwordEncoder.encode("segredo1")).thenReturn("hashed");
        when(userRepository.save(any(User.class))).thenAnswer(a -> {
            User u = a.getArgument(0);
            TestSupport.setId(u, 7L);
            return u;
        });

        var resp = c.register(new AuthController.RegisterRequest(
                "  Ana  ", "ANA@ex.com", "segredo1", null), HTTP);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        var body = (AuthController.AuthResponse) resp.getBody();
        assertThat(body.token()).isEqualTo("jwt-token");
        assertThat(body.user().email()).isEqualTo("ana@ex.com"); // normalizado
        assertThat(body.user().name()).isEqualTo("Ana");         // trim
    }

    @Test
    void registoComEmailJaExistenteDevolve409() {
        var c = controller("");
        when(userRepository.existsByEmail("ana@ex.com")).thenReturn(true);

        var resp = c.register(new AuthController.RegisterRequest(
                "Ana", "ana@ex.com", "segredo1", null), HTTP);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        verify(userRepository, never()).save(any());
    }

    @Test
    void codigoDeConviteErradoDevolve403SemTocarNaBd() {
        var c = controller("SEGREDO");

        var resp = c.register(new AuthController.RegisterRequest(
                "Ana", "ana@ex.com", "segredo1", "errado"), HTTP);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        verify(userRepository, never()).existsByEmail(any());
        verify(userRepository, never()).save(any());
    }

    @Test
    void codigoDeConviteCorretoDeixaRegistar() {
        var c = controller("SEGREDO");
        when(userRepository.existsByEmail(any())).thenReturn(false);
        when(passwordEncoder.encode(any())).thenReturn("hashed");
        when(userRepository.save(any(User.class))).thenAnswer(a -> {
            User u = a.getArgument(0);
            TestSupport.setId(u, 3L);
            return u;
        });

        var resp = c.register(new AuthController.RegisterRequest(
                "Ana", "ana@ex.com", "segredo1", "  SEGREDO  "), HTTP); // trim aplicado

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void palavraPasseComMaisDe72BytesDevolve400() {
        var c = controller("");
        // 40 caracteres, mas 80 bytes em UTF-8
        assertThatThrownBy(() -> c.register(new AuthController.RegisterRequest(
                "Ana", "ana@ex.com", "é".repeat(40), null), HTTP))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
        verify(passwordEncoder, never()).encode("é".repeat(40));
    }

    // ---------- login ----------

    @Test
    void loginCorretoDevolveToken() {
        var c = controller("");
        User u = savedUser(5L, "ana@ex.com");
        when(userRepository.findByEmail("ana@ex.com")).thenReturn(Optional.of(u));
        when(passwordEncoder.matches("segredo1", "hash")).thenReturn(true);

        var resp = c.login(new AuthController.LoginRequest("  ANA@ex.com ", "segredo1"), HTTP);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        var body = (AuthController.AuthResponse) resp.getBody();
        assertThat(body.user().id()).isEqualTo(5L);
    }

    @Test
    void loginComPasswordErradaDevolve401() {
        var c = controller("");
        User u = savedUser(5L, "ana@ex.com");
        when(userRepository.findByEmail("ana@ex.com")).thenReturn(Optional.of(u));
        when(passwordEncoder.matches(any(), any())).thenReturn(false);

        var resp = c.login(new AuthController.LoginRequest("ana@ex.com", "errada"), HTTP);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void loginComEmailInexistenteCorreOBcryptNaMesmaEDevolveOMesmo401() {
        // o hash fictício é gerado no arranque pelo mesmo encoder (mesmo custo dos hashes reais)
        when(passwordEncoder.encode(any())).thenReturn("dummy-hash");
        var c = controller("");
        when(userRepository.findByEmail("nao@ex.com")).thenReturn(Optional.empty());
        when(passwordEncoder.matches("seja", "dummy-hash")).thenReturn(true); // nem assim entra

        var resp = c.login(new AuthController.LoginRequest("nao@ex.com", "seja"), HTTP);

        verify(passwordEncoder).matches("seja", "dummy-hash");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);

        // resposta indistinguível da de palavra-passe errada (estado + corpo)
        User u = savedUser(5L, "ana@ex.com");
        when(userRepository.findByEmail("ana@ex.com")).thenReturn(Optional.of(u));
        when(passwordEncoder.matches("errada", "hash")).thenReturn(false);
        var wrong = c.login(new AuthController.LoginRequest("ana@ex.com", "errada"), HTTP);

        assertThat(resp.getStatusCode()).isEqualTo(wrong.getStatusCode());
        assertThat(resp.getBody()).isEqualTo(wrong.getBody());
        assertThat(resp.getHeaders()).isEqualTo(wrong.getHeaders());
    }

    @Test
    void loginComEmailInexistenteContaFalhaNoRateLimiterComoPasswordErrada() {
        // 5 falhas por email bloqueiam, exista a conta ou não
        var c = controller("");
        when(userRepository.findByEmail(any())).thenReturn(Optional.empty());
        for (int i = 0; i < 5; i++) {
            assertThat(c.login(new AuthController.LoginRequest("nao@ex.com", "x"), HTTP).getStatusCode())
                    .isEqualTo(HttpStatus.UNAUTHORIZED);
        }
        assertThat(c.login(new AuthController.LoginRequest("nao@ex.com", "x"), HTTP).getStatusCode())
                .isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
    }

    // ---------- me / currency ----------

    @Test
    void meDevolveOsDadosDoUtilizadorAutenticado() {
        var c = controller("");
        User u = savedUser(9L, "ana@ex.com");

        var dto = c.me(u);

        assertThat(dto.id()).isEqualTo(9L);
        assertThat(dto.baseCurrency()).isEqualTo("EUR");
    }

    @Test
    void setCurrencyAceitaMoedaSuportadaEGuarda() {
        var c = controller("");
        User u = savedUser(9L, "ana@ex.com");

        var dto = c.setCurrency(u, new AuthController.CurrencyRequest(" usd "));

        assertThat(dto.baseCurrency()).isEqualTo("USD");
        verify(userRepository).save(u);
    }

    @Test
    void setCurrencyRejeitaMoedaNaoSuportadaCom400() {
        var c = controller("");
        User u = savedUser(9L, "ana@ex.com");

        assertThatThrownBy(() -> c.setCurrency(u, new AuthController.CurrencyRequest("XYZ")))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
        verify(userRepository, never()).save(any());
    }
}
