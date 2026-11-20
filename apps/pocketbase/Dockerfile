# PocketBase untuk Railway.
# Versi dipasang dari rilis resmi.
FROM alpine:3.20 AS fetch
ARG PB_VERSION=0.40.6
RUN apk add --no-cache curl unzip \
 && curl -fsSL -o /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" \
 && unzip /tmp/pb.zip pocketbase -d /pb \
 && chmod +x /pb/pocketbase

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /pb
COPY --from=fetch /pb/pocketbase /pb/pocketbase
COPY apps/pocketbase/pb_migrations /pb/pb_migrations
COPY apps/pocketbase/pb_hooks /pb/pb_hooks
COPY apps/pocketbase/pb_import_hooks /pb/pb_import_hooks
COPY apps/pocketbase/entrypoint.sh /pb/entrypoint.sh
RUN chmod +x /pb/entrypoint.sh
EXPOSE 8090
ENTRYPOINT ["/pb/entrypoint.sh"]
