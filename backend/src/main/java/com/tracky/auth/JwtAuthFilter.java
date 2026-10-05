package com.tracky.auth;

import com.tracky.config.RequestLogFilter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtService jwtService;
    private final UserRepository userRepository;

    public JwtAuthFilter(JwtService jwtService, UserRepository userRepository) {
        this.jwtService = jwtService;
        this.userRepository = userRepository;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            jwtService.validate(header.substring(7))
                    .flatMap(userRepository::findById)
                    .ifPresent(user -> {
                        var roles = user.isAdmin() ? List.of(new SimpleGrantedAuthority("ROLE_ADMIN")) : List.<SimpleGrantedAuthority>of();
                        var auth = new UsernamePasswordAuthenticationToken(user, null, roles);
                        SecurityContextHolder.getContext().setAuthentication(auth);
                        // o RequestLogFilter (que envolve este filtro) limpa o MDC no fim
                        MDC.put(RequestLogFilter.USER_ID, String.valueOf(user.getId()));
                        request.setAttribute(RequestLogFilter.USER_ID_ATTR, user.getId());
                    });
        }
        chain.doFilter(request, response);
    }
}
