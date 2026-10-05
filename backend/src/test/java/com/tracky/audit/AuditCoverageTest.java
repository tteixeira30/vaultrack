package com.tracky.audit;

import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;

import java.lang.reflect.Method;
import java.util.Set;
import java.util.TreeSet;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Teste-guarda: cada endpoint que altera dados (POST/PUT/PATCH/DELETE) tem de estar numa
 * das listas. Endpoint novo → grava um evento de auditoria e junta-o a AUDITADOS, ou
 * explica em EXCLUIDOS porque não precisa.
 */
class AuditCoverageTest {

    static final Set<String> AUDITADOS = Set.of(
            "POST /api/auth/register",
            "POST /api/auth/login",
            "PUT /api/auth/me/currency",
            "POST /api/goals",
            "PUT /api/goals/{id}",
            "POST /api/goals/{id}/contribute",
            "DELETE /api/goals/{id}",
            "POST /api/investments",
            "PUT /api/investments/{id}",
            "DELETE /api/investments/{id}",
            "POST /api/calendar/events",
            "PUT /api/calendar/events/{id}",
            "DELETE /api/calendar/events/{id}",
            "PUT /api/income",
            "POST /api/income/allocations",
            "PUT /api/income/allocations/{id}",
            "DELETE /api/income/allocations/{id}",
            "POST /api/income/allocations/{allocId}/items",
            "PUT /api/income/allocations/items/{id}",
            "DELETE /api/income/allocations/items/{id}",
            "POST /api/expenses/accounts",
            "PUT /api/expenses/accounts/{id}",
            "DELETE /api/expenses/accounts/{id}",
            "POST /api/expenses/transactions",
            "PUT /api/expenses/transactions/{id}",
            "DELETE /api/expenses/transactions/{id}",
            "DELETE /api/expenses/rules/{id}",
            "POST /api/expenses/categories",
            "PUT /api/expenses/categories/{id}",
            "DELETE /api/expenses/categories/{id}",
            "POST /api/expenses/import",
            "POST /api/contributions/apply");

    static final Set<String> EXCLUIDOS = Set.of(
            // só limpa a cache de cotações; não altera dados do utilizador
            "POST /api/investments/refresh");

    private static final Set<RequestMethod> WRITES =
            Set.of(RequestMethod.POST, RequestMethod.PUT, RequestMethod.PATCH, RequestMethod.DELETE);

    @Test
    void todosOsEndpointsQueAlteramDadosEstaoClassificados() throws Exception {
        var scanner = new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AnnotationTypeFilter(RestController.class));
        Set<String> found = new TreeSet<>();
        for (var bd : scanner.findCandidateComponents("com.tracky")) {
            Class<?> type = Class.forName(bd.getBeanClassName());
            RequestMapping base = AnnotatedElementUtils.findMergedAnnotation(type, RequestMapping.class);
            String prefix = base == null || base.path().length == 0 ? "" : base.path()[0];
            for (Method m : type.getDeclaredMethods()) {
                RequestMapping rm = AnnotatedElementUtils.findMergedAnnotation(m, RequestMapping.class);
                if (rm == null) continue;
                String path = prefix + (rm.path().length == 0 ? "" : rm.path()[0]);
                for (RequestMethod method : rm.method()) {
                    if (WRITES.contains(method)) found.add(method + " " + path);
                }
            }
        }
        Set<String> classified = new TreeSet<>(AUDITADOS);
        classified.addAll(EXCLUIDOS);
        assertThat(found).isEqualTo(classified);
    }
}
