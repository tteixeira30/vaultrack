FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -q dependency:go-offline
COPY src ./src
RUN mvn -q package -DskipTests

FROM eclipse-temurin:24-jre-alpine
WORKDIR /app
# netcat para o wait-for-db do entrypoint (espera a DB antes de arrancar o Java)
RUN apk add --no-cache netcat-openbsd
COPY --from=build /app/target/*.jar app.jar
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh
# corre como utilizador não-root (hardening; a porta 8080 não é privilegiada)
RUN addgroup -S tracky && adduser -S tracky -G tracky
USER tracky
EXPOSE 8080
ENTRYPOINT ["/app/docker-entrypoint.sh"]
