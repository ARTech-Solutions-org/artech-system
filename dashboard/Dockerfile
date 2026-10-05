FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Keeps dev tools (drizzle-kit, tsx) so migrations, the admin seed and `npm run n8n:setup` run inside the container.
FROM node:24-alpine
WORKDIR /app
RUN apk add --no-cache tzdata
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 TZ=Africa/Cairo
COPY --from=build /app ./
EXPOSE 3000
CMD ["sh", "-c", "npx drizzle-kit migrate && npx tsx scripts/seed-admin.ts && npx next start -H 0.0.0.0 -p 3000"]
