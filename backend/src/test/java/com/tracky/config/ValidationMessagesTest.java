package com.tracky.config;

import com.tracky.calendar.CalendarController;
import com.tracky.calendar.CalendarEvent;
import com.tracky.expense.ExpenseController;
import com.tracky.goal.GoalController;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/** As mensagens por omissão do Bean Validation saem em PT-PT (com acentos, em UTF-8). */
class ValidationMessagesTest {

    private static final ValidatorFactory FACTORY = Validation.buildDefaultValidatorFactory();
    private static final Validator V = FACTORY.getValidator();

    @AfterAll
    static void close() { FACTORY.close(); }

    private static List<String> messages(Object o) {
        Set<ConstraintViolation<Object>> v = V.validate(o);
        return v.stream().map(ConstraintViolation::getMessage).collect(Collectors.toList());
    }

    @Test
    void montanteNegativoEmPortugues() {
        var msgs = messages(new ExpenseController.TransactionRequest(1L, LocalDate.of(2026, 9, 1), "x",
                new BigDecimal("-5"), false, null, null));
        assertThat(msgs).containsExactly("O montante tem de ser maior que 0.");
    }

    @Test
    void objetivoNegativoEmPortugues() {
        var msgs = messages(new GoalController.GoalRequest("Férias", new BigDecimal("-100"), BigDecimal.ONE, null, null, null));
        assertThat(msgs).containsExactly("O valor do objetivo tem de ser maior que 0.");
    }

    @Test
    void eventoDoCalendarioNegativoEmPortugues() {
        var msgs = messages(new CalendarController.EventRequest("Renda", CalendarEvent.Category.values()[0], false,
                new BigDecimal("-10"), CalendarEvent.Frequency.MONTHLY, 1, null, true));
        assertThat(msgs).containsExactly("O montante tem de ser maior que 0.");
    }

    @Test
    void campoObrigatorioEmFaltaEmPortugues() {
        var msgs = messages(new GoalController.ContributionRequest(null));
        assertThat(msgs).containsExactly("Falta preencher um campo obrigatório.");
        var vazio = messages(new ExpenseController.AccountRequest(" ", null));
        assertThat(vazio).containsExactly("O nome não pode estar vazio.");
    }

    @Test
    void naoDependeDoLocaleDoPedido() {
        Locale old = Locale.getDefault();
        try {
            Locale.setDefault(Locale.US);
            assertThat(messages(new GoalController.ContributionRequest(null)))
                    .containsExactly("Falta preencher um campo obrigatório.");
        } finally {
            Locale.setDefault(old);
        }
    }
}
