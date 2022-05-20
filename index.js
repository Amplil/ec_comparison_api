const express=require('express');
const item_search = require("./item_search");
const serverless = require("serverless-http");

const app=express();

app.get("/", (req,res,next)=>{
  (async ()=>{
      const is=new item_search(
          req.query.shop, req.query.keyword, req.query.order, req.query.tr_keyword
      );
      //const result=await is.amazon();
      //const result=await is.rakuten();
      const result=await is.get();
      return res.json(result);
  })().catch(next);
});

app.use((req, res, next) => {
  return res.status(404).json({
    error: "Not Found",
  });
});
  
module.exports.handler = serverless(app);
