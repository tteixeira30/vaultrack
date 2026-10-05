package com.tracky.auth;

import com.tracky.audit.AuditAction;
import com.tracky.audit.AuditEntity;
import com.tracky.audit.AuditService;
import com.tracky.currency.CurrencyService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuthRateLimiter rateLimiter;

    /** Se definido, o registo exige este código de convite. Vazio = registo aberto (uso local). */
    private final String inviteCode;

    /**
     * Hash de uma palavra-passe aleatória, gerado no arranque com o mesmo encoder (e o mesmo custo)
     * dos hashes reais. O login com um email inexistente verifica contra ele, para o tempo de
     * resposta não revelar se a conta existe.
     */
    private final String dummyHash;

    private AuditService audit = AuditService.NOOP;

    public AuthController(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtService jwtService,
                          @Value("${tracky.invite-code:}") String inviteCode, AuthRateLimiter rateLimiter) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.inviteCode = inviteCode == null ? "" : inviteCode.trim();
        this.rateLimiter = rateLimiter;
        this.dummyHash = passwordEncoder.encode(UUID.randomUUID().toString());
    }

    @Autowired
    void setAudit(AuditService audit) {
        this.audit = audit;
    }

    // max 72 na palavra-passe: o BCrypt só usa os primeiros 72 bytes e recusa mais ao gerar o hash
    public record RegisterRequest(@NotBlank @Size(max = 100, message = "O nome não pode ter mais de 100 caracteres.") String name,
                                  @NotBlank @Email @Size(max = 254, message = "O email não pode ter mais de 254 caracteres.") String email,
                                  @NotBlank @Size(min = 8, message = "A palavra-passe deve ter pelo menos 8 caracteres.")
                                  @Size(max = 72, message = "A palavra-passe é demasiado longa.") String password,
                                  @Size(max = 100, message = "Código de convite inválido.") String inviteCode) {}
    /** Sem mínimo na palavra-passe: contas antigas foram criadas quando o mínimo era 6. */
    public record LoginRequest(@NotBlank @Size(max = 254, message = "Email ou palavra-passe incorretos.") String email,
                               @NotBlank String password) {}
    public record UserDto(Long id, String name, String email, String baseCurrency, boolean admin) {}
    public record AuthResponse(String token, UserDto user) {}
    public record CurrencyRequest(@NotBlank @Size(max = 10, message = "Moeda não suportada.") String baseCurrency) {}

    private static final String TOO_MANY = "Demasiadas tentativas. Tenta novamente daqui a alguns minutos.";

    @PostMapping("/register")
    public ResponseEntity<?> register(@Valid @RequestBody RegisterRequest req, HttpServletRequest http) {
        long wait = rateLimiter.tryRegister(http.getRemoteAddr());
        if (wait > 0) {
            audit.security(AuditAction.RATE_LIMITED, null, AuditService.fields("endpoint", "register"));
            return tooManyRequests(wait);
        }
        if (req.password().getBytes(StandardCharsets.UTF_8).length > 72) {
            // caracteres acentuados ocupam mais de um byte; o @Size só conta caracteres
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A palavra-passe é demasiado longa.");
        }
        if (!inviteCode.isEmpty() && !inviteMatches(req.inviteCode())) {
            audit.security(AuditAction.INVITE_REJECTED, null, null);
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("message", "Código de convite inválido."));
        }
        String email = req.email().trim().toLowerCase(Locale.ROOT);
        if (userRepository.existsByEmail(email)) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("message", "Já existe uma conta com este email."));
        }
        User user = new User();
        user.setName(req.name().trim());
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(req.password()));
        user = userRepository.save(user);
        audit.security(AuditAction.REGISTERED, user.getId(), null);
        return ResponseEntity.ok(new AuthResponse(jwtService.generate(user.getId()), toDto(user)));
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginRequest req, HttpServletRequest http) {
        String email = req.email().trim().toLowerCase(Locale.ROOT);
        long wait = rateLimiter.tryLogin(http.getRemoteAddr(), email);
        if (wait > 0) {
            Long userId = userRepository.findByEmail(email).map(User::getId).orElse(null);
            audit.security(AuditAction.RATE_LIMITED, userId, AuditService.fields("endpoint", "login"));
            return tooManyRequests(wait);
        }
        Optional<User> user = userRepository.findByEmail(email);
        // sem conta, verifica na mesma contra o hash fictício: o custo do BCrypt é igual nos dois casos
        String hash = user.map(User::getPasswordHash).orElse(dummyHash);
        boolean matches = passwordEncoder.matches(req.password(), hash);
        // exatamente um evento em cada caso (com ou sem conta): gravar só quando a conta
        // existe voltava a revelar, pelo tempo de resposta, que emails estão registados
        if (user.isEmpty() || !matches) {
            audit.security(AuditAction.LOGIN_FAILED, user.map(User::getId).orElse(null), null);
            rateLimiter.loginFailed(email);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "Email ou palavra-passe incorretos."));
        }
        rateLimiter.loginSucceeded(email);
        audit.security(AuditAction.LOGIN_SUCCEEDED, user.get().getId(), null);
        return ResponseEntity.ok(new AuthResponse(jwtService.generate(user.get().getId()), toDto(user.get())));
    }

    @GetMapping("/me")
    public UserDto me(@AuthenticationPrincipal User user) {
        return toDto(user);
    }

    @PutMapping("/me/currency")
    public UserDto setCurrency(@AuthenticationPrincipal User user, @Valid @RequestBody CurrencyRequest req) {
        String c = req.baseCurrency().trim().toUpperCase(Locale.ROOT);
        if (!CurrencyService.SUPPORTED.contains(c)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Moeda não suportada: " + req.baseCurrency());
        }
        String before = user.getBaseCurrency();
        user.setBaseCurrency(c);
        userRepository.save(user);
        audit.updated(user.getId(), AuditEntity.USER, user.getId(), null,
                AuditService.fields("baseCurrency", before), AuditService.fields("baseCurrency", c));
        return toDto(user);
    }

    /** Comparação em tempo constante, para o tempo de resposta não revelar o código. */
    private boolean inviteMatches(String provided) {
        byte[] expected = inviteCode.getBytes(StandardCharsets.UTF_8);
        byte[] given = (provided == null ? "" : provided.trim()).getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(expected, given);
    }

    private static ResponseEntity<?> tooManyRequests(long retryAfterSeconds) {
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header(HttpHeaders.RETRY_AFTER, String.valueOf(retryAfterSeconds))
                .body(Map.of("message", TOO_MANY));
    }

    private UserDto toDto(User u) {
        return new UserDto(u.getId(), u.getName(), u.getEmail(), u.getBaseCurrency(), u.isAdmin());
    }
}
