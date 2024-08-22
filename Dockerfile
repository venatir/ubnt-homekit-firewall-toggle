FROM node:latest
LABEL authors="venatir"
RUN mkdir /app
COPY . /app
WORKDIR /app

RUN npm install

FROM node:latest
COPY --from=0 /app /app
WORKDIR /app
CMD ["npm", "start"]