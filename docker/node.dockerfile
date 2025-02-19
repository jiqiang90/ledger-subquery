FROM node:16-slim AS builder

RUN apt-get update && apt-get install -y tree

WORKDIR /app

# add the dependencies
ADD ./package.json yarn.lock /app/
RUN yarn install --frozen-lockfile

# add the remaining parts of the produce the build
COPY . /app
RUN yarn codegen && yarn build

# build subql common package
WORKDIR /app/subql
RUN yarn install && yarn build

FROM onfinality/subql-node-cosmos:v0.2.0

# Add system dependencies
RUN apk update
RUN apk add postgresql14-client

# NB: add SigNoz / OpenTelemetry dependencies
WORKDIR /usr/local/lib/node_modules/@subql/node-cosmos
RUN yarn add "@grpc/grpc-js" \
             "@opentelemetry/api" \
             "@opentelemetry/auto-instrumentations-node" \
             "@opentelemetry/exporter-trace-otlp-grpc" \
             "@opentelemetry/sdk-node"

# add extra tools that are required
ADD https://github.com/mikefarah/yq/releases/download/v4.26.1/yq_linux_amd64 /usr/local/bin/yq
RUN chmod +x /usr/local/bin/yq

WORKDIR /app

# install global dependencies
RUN npm install -g graphile-migrate

# add the dependencies
ADD ./package.json yarn.lock /app/
RUN yarn install --frozen-lockfile --prod

# NB: replace built node-cosmos run module
COPY ./docker/node-cosmos /usr/local/lib/node_modules/@subql/node-cosmos
COPY ./.gmrc /app/.gmrc
COPY --from=builder /app/subql/packages/common /usr/local/lib/node_modules/@subql/node-cosmos/node_modules/@subql/common

COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/migrations /app/migrations
ADD ./proto /app/proto
ADD ./project.yaml schema.graphql /app/
ADD ./scripts/node-entrypoint.sh /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
