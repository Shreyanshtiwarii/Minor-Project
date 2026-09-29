# Multi-stage Dockerfile for GreenMove Spring Boot Backend (Java 21)

# Stage 1: Build Stage
FROM eclipse-temurin:21-jdk-alpine AS builder
WORKDIR /app

# Copy Maven wrapper and POM
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./

# Grant execution permission for mvnw wrapper script
RUN chmod +x mvnw

# Copy source code
COPY src/ src/

# Package application executable JAR skipping unit tests
RUN ./mvnw clean package -DskipTests

# Stage 2: Production Runtime Stage
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# Create non-root system user for security
RUN addgroup -S greenmove && adduser -S greenmove -G greenmove
USER greenmove:greenmove

# Copy built executable JAR from builder stage
COPY --from=builder /app/target/backend-0.0.1-SNAPSHOT.jar app.jar

# Expose default container port
EXPOSE 8080

# Configure entrypoint to dynamically bind Render's PORT environment variable
ENTRYPOINT ["sh", "-c", "java -Dserver.port=${PORT:-8080} -jar app.jar"]
