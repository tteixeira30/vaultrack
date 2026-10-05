package com.tracky.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;

    @Column(unique = true, nullable = false)
    private String email;

    @Column(nullable = false)
    private String passwordHash;

    /** Moeda base de apresentação (ISO 4217, ex: EUR, USD). O cálculo interno é sempre em EUR. */
    @Column(length = 3)
    private String baseCurrency = "EUR";

    private Instant createdAt = Instant.now();

    /**
     * Vê a auditoria de todos os utilizadores. Só se promove por SQL
     * ({@code UPDATE users SET admin = true WHERE id = ...}); nulo nas linhas antigas = false.
     */
    private Boolean admin;

    public Long getId() { return id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }
    public String getBaseCurrency() { return baseCurrency == null ? "EUR" : baseCurrency; }
    public void setBaseCurrency(String baseCurrency) { this.baseCurrency = baseCurrency; }
    public Instant getCreatedAt() { return createdAt; }
    public boolean isAdmin() { return Boolean.TRUE.equals(admin); }
}
