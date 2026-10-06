const {response,resolvePrice}=require("./_lib/common");
exports.handler=async(event)=>{
  if(event.httpMethod==="OPTIONS")return response(200,{ok:true});
  try{
    const {ticker,market}=event.queryStringParameters||{};
    if(!ticker)return response(400,{error:"ticker is required"});
    return response(200,await resolvePrice({ticker,market}));
  }catch(e){return response(502,{error:e.message||"price lookup failed"});}
};
