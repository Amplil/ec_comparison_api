var http=require('http');
var express=require('express');
const serverless = require("serverless-http");

var app=express();

app.get("/", (req,res)=>{
  return res.send("Hello World! express + Lambda");
});

app.use((req, res, next) => {
    return res.status(404).json({
      error: "Not Found",
    });
  });
  
var server=http.createServer(app);

server.listen(3000);

module.exports.handler = serverless(app);
