require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');
const cheerio = require('cheerio');
const xml2js = require( "xml2js" );
const EbayAuthToken = require('ebay-oauth-nodejs-client');

const USDJPY=120;

class ItemSearch{
    constructor(shop_disp, keyword, sort, tr_keyword){
        this.item_id=0;
        this.image="";
        this.url="";
        this.title="";
        this.price="";
        this.shop="";    
        this.items=[];

        if(typeof shop_disp=='object') this.shop_disp=shop_disp;
        else{
            console.log("shop_disp is not object");
            this.shop_disp=['amazon','rakuten','ebay'];
        }
        this.keyword=keyword;
        this.sort=sort;
        this.tr_keyword=tr_keyword;
    }
    async get(){
        const ProArr=[]; // Promise Array
        if (this.shop_disp.includes('rakuten'))ProArr.push(this.rakuten());
        if (this.shop_disp.includes('amazon'))ProArr.push(this.amazon());
        if (this.shop_disp.includes('ebay'))ProArr.push(this.ebay());
        await Promise.all(ProArr); // api取得を並列処理
        //await this.sort_items();
        switch(this.sort){
            case 'relevanceblender':
                await this.shop_assort();
                break;
            case 'review-rank':
                await this.shop_assort();
                break;
            case 'price-asc-rank':
                await this.price_sort('ASC');
                break;
            case 'price-desc-rank':
                await this.price_sort('DESC');
                break;
        }
        return this.items;
    };
    rakuten=()=>{
        return new Promise((resolve,reject)=>{
            const sort_str={'relevanceblender':'standard',
                        'review-rank':'-reviewCount',
                        'price-asc-rank':'+itemPrice',
                        'price-desc-rank':'-itemPrice'}; // 各ショップでのsortの名称
            const page = 1; // 取得ページ
            const hits_set = 10; // 1ページあたりの取得件数（商品数）
            const applicationId = process.env.rakuten_applicationId; // アプリID
            const affiliateId = process.env.rakuten_affiliateId; // アフィリエイトID
            // 楽天リクエストURLから楽天市場の商品情報を取得
            const get_url = "https://app.rakuten.co.jp/services/api/IchibaItem/Search/20130805?format=xml&keyword=" 
                + encodeURI(this.keyword)
                + "&sort=" + encodeURI(sort_str[this.sort])
                + "&page=" + page 
                + "&hits=" + hits_set 
                + "&applicationId=" + applicationId 
                + "&affiliateId=" + affiliateId;
            axios.get(get_url)
            .then(response => {
                xml2js.parseString(response.data,(error, result)=>{
                    if(error)console.log(error.message);
                    else {
                        result.root.Items[0].Item.forEach(item => {
                            try{
                                this.shop='rakuten';
                                this.url = item.affiliateUrl[0];
                                this.image = item.mediumImageUrls[0].imageUrl[0];
                                this.title = item.itemName[0];
                                this.price = item.itemPrice[0];
                                this.item_id=this.md5hex(this.image); // 画像URLでitem_idを生成する
                            }catch(error){
                                console.log('rakuten item skipped');
                                skip;
                            }
                            (async()=>{await this.add_item();})().catch(error=>{console.log(error);});

                        });
                    }
               });
               //console.log("items: ",this.items);
               resolve(this.items);
            })
            .catch(error => {
                console.log(error);
                reject(error);
            })
        });
    };
    amazon=()=>{
        return new Promise((resolve,reject)=>{
            //console.log('amazon method');
            const sort_str={'relevanceblender':'relevanceblender',
                        'review-rank':'review-rank',
                        'price-asc-rank':'price-asc-rank',
                        'price-desc-rank':'price-desc-rank'}; // 各ショップでのsortの名称 おすすめ（relevanceblender）でなくreview-rankにする
            const hits_set = 10; // 取得件数（商品数）
            const get_url="https://www.amazon.co.jp/s?k=" 
                + encodeURI(this.keyword)
                +"&s="+encodeURI(sort_str[this.sort]);

            axios.get(get_url)
            .then(response => {
                const htmlParcer=response.data;
                //console.log(htmlParcer);
                const $ = cheerio.load(htmlParcer);
                $('.a-spacing-base').each((item_num,node) => {
                    //console.log('item_num>=hits_set');
                    if(item_num>=hits_set){ // hits_set分アイテムを追加したら、それ以降は処理を終了
                        return false;
                    }
                    try{
                        this.shop='amazon';
                        this.image =$(node).find('img').attr('src');
                        const oringin_url = 'https://www.amazon.co.jp'+$(node).find('.a-link-normal').attr('href');
                        this.title=$(node).find("span.a-text-normal").text();
                        this.price=$(node).find('.a-price-whole').text().replace('￥','').replace(',','');
                        this.item_id=this.md5hex(this.image); // 画像URLでitem_idを生成する
                        this.url =oringin_url+'&tag=amazonsearch-22';
                        if (this.price=="" | this.item_id==""){
                            console.log('There is not a price or id: amazon item skipped');
                            return; // 価格またはidがないものは飛ばす(cheerioはreturnだけだとcontinueの意味になる)
                        }
                    }catch(error){
                        console.log('amazon item skipped');
                        return; // cheerioはreturnだけだとcontinueの意味になる
                    }
                    //console.log('item_num: ',item_num);
                    //console.log('image: ',this.image);
                    //console.log('oringin_url: ',oringin_url);
                    //console.log('cheerio title: ',this.title);
                    //console.log('price: ',this.price);
                    //console.log('item_id: ',this.item_id);
                    //console.log('url: ',this.url);
                    (async ()=>{
                        await this.add_item();
                    })().catch(error => {console.log(error,"item_num: ",item_num);});
                });
                resolve(this.items);
            })
            .catch(error => {
                console.log(error);
                reject(error);
            })
        });
    };
    ebay=()=>{
        return new Promise((resolve,reject)=>{
            const sort_str={'relevanceblender':'',
                            'review-rank':'distance',
                            'price-asc-rank':'price',
                            'price-desc-rank':'-price'}; // 各ショップでのsortの名称
            const hits_set = 10; // 取得件数（商品数）
            const affiliateId=process.env.ebay_affiliateId;

            (async ()=>{
                // 毎回アクセストークンを取得する
                const ebayAuthToken = new EbayAuthToken({
                    clientId: process.env.NewEbayApi_ClientId,
                    clientSecret: process.env.NewEbayApi_ClientSecret,
                });
                const token = await ebayAuthToken.getApplicationToken('PRODUCTION');
                //console.log("token",token);
                const AccessToken = JSON.parse(token).access_token;

                const sarch_word=this.tr_keyword==='' ? this.keyword : this.tr_keyword;
                const get_url = "https://api.ebay.com/buy/browse/v1/item_summary/search"
                +"?q="+encodeURI(sarch_word)
                +"&limit="+hits_set
                +"&sort="+sort_str[this.sort];
                axios.get(get_url, 
                    { headers:{
                        'X-EBAY-C-ENDUSERCTX': 'affiliateCampaignId='+affiliateId,
                        'Authorization': 'Bearer '+AccessToken
                    }})
                .then(response => {
                    //console.log('response.data: ',response.data);
                    if(response.data.total==0){
                        console.log('There is not a item: ebay finished');
                        resolve(this.items);
                        return false;
                    }
                    response.data.itemSummaries.forEach(item => {
                        try{
                            this.shop='ebay';
                            this.url = item.itemAffiliateWebUrl;
                            this.image = item.image.imageUrl;
                            this.title = item.title;
                            this.price = Math.round((item.price.value)*USDJPY); // USDのためJPYに直す
                            this.item_id=this.md5hex(item.itemId); // ebayのitemIdからitem_idを生成する
                        }catch(error){
                            console.log('ebay item skipped');
                            return false;
                        }
                    (async()=>{await this.add_item();})().catch(error=>{console.log(error);});
                    });
                    resolve(this.items);
                }).catch(error => {console.log(error);});
            })()
            .catch(error => {
                console.log(error);
                reject(error);
            })
        });
    };
    md5hex=(str)=>{
        const md5 = crypto.createHash('md5')
        return md5.update(str, 'binary').digest('hex')
    };
    add_item=()=>{
        return new Promise((resolve,reject)=>{
            if (!this.items.some(item => item.item_id === this.item_id)){
                this.items.push(
                    {'item_id':this.item_id,'image':this.image,'url':this.url,'title':this.title,'price':this.price,'shop':this.shop}
                )
                resolve(this.items);
            }
            else{
                //console.log('some: ',this.items.some(item => item.item_id === this.item_id));
                //reject("add_item error, item_id:",this.item_id);
                reject("add_item error");
            }
        });
    };
    price_sort=(asc_desc)=>{
        const price_compare=(item1,item2)=>{
            let comparison = 0;
            if (item1.price > item2.price) {
            comparison = 1;
            } else if (item2.price > item1.price) {
            comparison = -1;
            }
            return comparison;    
        };
        if (asc_desc=='ASC'){
            this.items.sort(price_compare);
        }
        else{
            this.items.sort(price_compare).reverse();
        }
    };
    shop_assort=()=>{
        const temp_items=this.items;
        const assort_items=[];
        for(let i=0; (i<this.items.length && temp_items!==[]); i++){ // itemsの数分かtemp_itemsが空になるまで
            this.shop_disp.forEach(shop => {
                const item_num=temp_items.findIndex(item => item.shop === shop); // shopのitemを探す
                if(item_num!==-1){ // shopがtemp_itemsにあるか
                    assort_items.push(temp_items[item_num]);
                    temp_items.splice(item_num,1); // shopのitemをtemp_itemsから削除
                }
            });
        }
        this.items=assort_items;
    };
}

module.exports=ItemSearch;