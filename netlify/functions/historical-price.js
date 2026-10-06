const {response,resolvePrice}=require("./_lib/common");
exports.handler=async(event)=>{
  if(event.httpMethod==="OPTIONS")return response(200,{ok:true});
  try{
    const {ticker,market,date}=event.queryStringParameters||{};
    if(!ticker)return response(400,{error:"ticker is required"});
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date||""))return response(400,{error:"date must be YYYY-MM-DD"});
    return response(200,await resolvePrice({ticker,market,date}));
  }catch(e){return response(502,{error:e.message||"historical price lookup failed"});}
};
