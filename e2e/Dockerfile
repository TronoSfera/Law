FROM mcr.microsoft.com/playwright:v1.58.2-jammy

WORKDIR /opt/e2e

COPY e2e/package.json e2e/package-lock.json ./
RUN npm ci --no-audit --no-fund

ENV NODE_PATH=/opt/e2e/node_modules
ENV PATH=/opt/e2e/node_modules/.bin:$PATH
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
