package com.tracky.expense;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * As categorias de movimentos já foram um enum fixo ({@code Transaction.Category}).
 * Nessa altura o Hibernate criou uma CHECK constraint que fixa os valores possíveis
 * da coluna {@code category}; com {@code ddl-auto: update} essa constraint nunca é
 * removida, pelo que em bases de dados antigas continua a rejeitar qualquer
 * categoria personalizada criada pelo utilizador (ex.: GASOLEO).
 *
 * <p>Removemos as constraints no arranque — idempotente e seguro: a validação das
 * chaves é feita em {@code ExpenseController.resolveCategory} (só chaves por
 * omissão ou categorias do próprio utilizador são persistidas).
 */
@Component
public class ExpenseSchemaFixup {

    private static final Logger log = LoggerFactory.getLogger(ExpenseSchemaFixup.class);

    private final JdbcTemplate jdbc;

    public ExpenseSchemaFixup(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void dropStaleCategoryChecks() {
        drop("transactions", "transactions_category_check");
        drop("category_rules", "category_rules_category_check");
    }

    private void drop(String table, String constraint) {
        try {
            jdbc.execute("ALTER TABLE " + table + " DROP CONSTRAINT IF EXISTS " + constraint);
        } catch (Exception e) {
            // não impede o arranque — apenas regista para diagnóstico
            log.warn("Não foi possível remover {}: {}", constraint, e.getMessage());
        }
    }
}
