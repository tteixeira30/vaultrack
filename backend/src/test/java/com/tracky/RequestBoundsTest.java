package com.tracky;

import com.tracky.config.ClientErrorController;
import com.tracky.auth.AuthController;
import com.tracky.calendar.CalendarController;
import com.tracky.calendar.CalendarEvent;
import com.tracky.expense.ExpenseController;
import com.tracky.goal.GoalController;
import com.tracky.income.IncomeController;
import com.tracky.investment.Investment;
import com.tracky.investment.InvestmentController;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collections;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Limites de tamanho dos campos de texto dos pedidos: no limite passa, acima
 * falha a validação (que o Spring devolve como 400).
 */
class RequestBoundsTest {

    private static final ValidatorFactory FACTORY = Validation.buildDefaultValidatorFactory();
    private static final Validator V = FACTORY.getValidator();

    @AfterAll
    static void close() { FACTORY.close(); }

    private static String s(int n) { return "x".repeat(n); }

    private static Set<String> invalid(Object o) {
        Set<ConstraintViolation<Object>> v = V.validate(o);
        return v.stream().map(c -> c.getPropertyPath().toString())
                .collect(java.util.stream.Collectors.toSet());
    }

    @Test
    void auth() {
        assertThat(invalid(new AuthController.RegisterRequest(s(100), "a@b.pt", "12345678", s(100)))).isEmpty();
        assertThat(invalid(new AuthController.RegisterRequest(s(101), "a@b.pt", "12345678", null))).containsExactly("name");
        assertThat(invalid(new AuthController.RegisterRequest("Ana", "a@b.pt", "1234567", null))).containsExactly("password");
        assertThat(invalid(new AuthController.RegisterRequest("Ana", "a@b.pt", s(73), null))).containsExactly("password");
        assertThat(invalid(new AuthController.RegisterRequest("Ana", "a@b.pt", "12345678", s(101)))).containsExactly("inviteCode");
        assertThat(invalid(new AuthController.RegisterRequest("Ana", s(250) + "@b.pt", "12345678", null))).contains("email");
        // login: sem mínimo na palavra-passe (contas antigas)
        assertThat(invalid(new AuthController.LoginRequest("a@b.pt", "abc"))).isEmpty();
        assertThat(invalid(new AuthController.LoginRequest(s(255), "abc"))).containsExactly("email");
        assertThat(invalid(new AuthController.CurrencyRequest(s(11)))).containsExactly("baseCurrency");
    }

    @Test
    void calendario() {
        var ok = new CalendarController.EventRequest(s(100), CalendarEvent.Category.values()[0], false,
                BigDecimal.ONE, CalendarEvent.Frequency.MONTHLY, 1, null, true);
        assertThat(invalid(ok)).isEmpty();
        var longo = new CalendarController.EventRequest(s(101), CalendarEvent.Category.values()[0], false,
                BigDecimal.ONE, CalendarEvent.Frequency.MONTHLY, 1, null, true);
        assertThat(invalid(longo)).containsExactly("name");
    }

    @Test
    void despesas() {
        assertThat(invalid(new ExpenseController.AccountRequest(s(101), null))).containsExactly("name");
        LocalDate d = LocalDate.of(2026, 9, 1);
        assertThat(invalid(new ExpenseController.TransactionRequest(1L, d, s(500), BigDecimal.ONE, false, s(60), null))).isEmpty();
        assertThat(invalid(new ExpenseController.TransactionRequest(1L, d, s(501), BigDecimal.ONE, false, null, null))).containsExactly("description");
        assertThat(invalid(new ExpenseController.TransactionRequest(1L, d, "x", BigDecimal.ONE, false, s(61), null))).containsExactly("category");
        assertThat(invalid(new ExpenseController.CategoryRequest(s(61), null))).containsExactly("label");
        assertThat(invalid(new ExpenseController.CategoryRequest("Casa", s(21)))).containsExactly("color");

        var row = new ExpenseController.ImportRow(d, "Café", BigDecimal.ONE, false, null);
        assertThat(invalid(new ExpenseController.ImportRequest(1L, Collections.nCopies(5000, row), null))).isEmpty();
        assertThat(invalid(new ExpenseController.ImportRequest(1L, Collections.nCopies(5001, row), null))).containsExactly("rows");
        var longa = new ExpenseController.ImportRow(d, s(1001), BigDecimal.ONE, false, s(61));
        assertThat(invalid(new ExpenseController.ImportRequest(1L, List.of(longa), null)))
                .containsExactlyInAnyOrder("rows[0].description", "rows[0].category");
    }

    @Test
    void objetivos() {
        assertThat(invalid(new GoalController.GoalRequest(s(101), BigDecimal.TEN, BigDecimal.ONE, null, null, null)))
                .containsExactly("name");
    }

    @Test
    void rendimento() {
        assertThat(invalid(new IncomeController.AllocationRequest(s(101), BigDecimal.TEN, null, null))).containsExactly("name");
        assertThat(invalid(new IncomeController.AllocationRequest("Casa", BigDecimal.TEN, null, s(21)))).containsExactly("color");
        assertThat(invalid(new IncomeController.AllocationItemRequest(s(101), BigDecimal.ONE))).containsExactly("name");
    }

    @Test
    void errosDoCliente() {
        assertThat(invalid(new ClientErrorController.ClientErrorRequest(s(2000), s(10000), s(64), s(20), s(40)))).isEmpty();
        assertThat(invalid(new ClientErrorController.ClientErrorRequest(s(2001), s(10001), s(65), s(21), s(41))))
                .containsExactlyInAnyOrder("message", "stack", "version", "platform", "screen");
    }

    @Test
    void investimentos() {
        assertThat(invalid(new InvestmentController.CreateRequest(s(101), "VWCE", Investment.Type.ETF,
                BigDecimal.TEN, BigDecimal.ZERO, null, null))).containsExactly("name");
        assertThat(invalid(new InvestmentController.CreateRequest("ETF", s(61), Investment.Type.ETF,
                BigDecimal.TEN, BigDecimal.ZERO, null, null))).containsExactly("symbol");
        assertThat(invalid(new InvestmentController.UpdateRequest(s(101), null, null, null, null, null, null)))
                .containsExactly("name");
    }
}
