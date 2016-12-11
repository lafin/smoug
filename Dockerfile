FROM lafin/alpine:platform
MAINTAINER Sergey Kuvakin (lafin)

RUN adduser -D node
RUN apk add --no-cache nodejs openssl && \
  wget https://github.com/lafin/smoug/archive/master.zip && \
  unzip -q master.zip && \
  rm master.zip
RUN cd /smoug-master && npm i --production

ENTRYPOINT ["node", "/smoug-master/index.js"]
CMD ["-c"]
