FROM node:latest
LABEL authors="venatir"
RUN mkdir /app
COPY . /app
WORKDIR /app

RUN yarn install

FROM node:latest
COPY --from=0 /app /app
WORKDIR /app
CMD ["yarn", "start"]