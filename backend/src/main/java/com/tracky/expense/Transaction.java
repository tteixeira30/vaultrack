package com.tracky.expense;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

/**
 * Movimento de uma conta corrente (despesa ou receita), inserido manualmente
 * ou importado de um extrato bancário. Valores em EUR, sempre positivos —
 * o sentido vem de {@link #inflow}.
 */
@Entity
@Table(name = "transactions")
public class Transaction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id")
    private Long userId;

    @Column(name = "account_id")
    private Long accountId;

    private LocalDate txDate;

    @Column(length = 500)
    private String description;

    @Column(precision = 19, scale = 2)
    private BigDecimal amount;

    /** true = entrada de dinheiro; false = saída (despesa). */
    private boolean inflow = false;

    /**
     * Chave da categoria (ex.: "GROCERIES" ou a chave de uma categoria
     * personalizada do utilizador). Guardada como texto — as categorias já não
     * são um enum fixo. A coluna mantém-se a mesma que o enum STRING usava.
     */
    private String category = "OTHER";

    /**
     * Como o movimento entrou: "IMPORT" (extrato) ou "MANUAL" (escrito à mão).
     *
     * O design mostra-o por baixo da descrição — saber que uma linha veio do
     * banco é o que distingue um valor conferido de um escrito de cabeça. Com
     * `ddl-auto: update` as linhas antigas ficam a null, por isso o getter
     * assume MANUAL: antes de existir importação, era tudo à mão.
     */
    @Column(length = 16)
    private String source;

    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public Long getAccountId() { return accountId; }
    public void setAccountId(Long accountId) { this.accountId = accountId; }
    public LocalDate getTxDate() { return txDate; }
    public void setTxDate(LocalDate txDate) { this.txDate = txDate; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public boolean isInflow() { return inflow; }
    public void setInflow(boolean inflow) { this.inflow = inflow; }
    public String getCategory() { return category == null || category.isBlank() ? "OTHER" : category; }
    public void setCategory(String category) { this.category = category == null || category.isBlank() ? "OTHER" : category; }
    public String getSource() { return source == null || source.isBlank() ? "MANUAL" : source; }
    public void setSource(String source) { this.source = source; }
    public Instant getCreatedAt() { return createdAt; }
}
