const express=require('express');
const item_search = require("./item_search");

const app=express();
/*
(async ()=>{
    const is_log=new item_search(['amazon','ebay'],'keyboad','price-asc-rank','');
    //await is_log.rakuten();
    //await is_log.ebay();
    await is_log.get();
    console.log("items: ",is_log.items);
})().catch(error => {console.log(error);});
*/
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
  
app.listen(3000);
