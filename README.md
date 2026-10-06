# AssetView Netlify 시세 프록시 패키지

이 폴더는 AssetView와 시세 프록시를 한 사이트로 배포하기 위한 구성입니다.

## 기본 동작

- 기본 제공자: `yahoo`
  - API 키가 필요 없습니다.
  - 미국주식/ETF, 한국 KRX 종목(.KS 우선, 실패 시 .KQ), USD/KRW 환율을 조회합니다.
  - 비공식 엔드포인트이므로 향후 형식 변경이나 일시적 차단 가능성이 있습니다.
- 선택 제공자: `twelvedata`
  - 공식 API입니다.
  - Netlify 환경변수 `PRICE_PROVIDER=twelvedata`, `TWELVE_DATA_API_KEY=...` 설정이 필요합니다.
  - 사용 플랜에 따라 한국시장 데이터 접근 범위가 달라질 수 있습니다.

## AssetView에서 하는 일

Netlify에 이 패키지를 함께 배포하면 AssetView가 자동으로 다음 주소를 사용합니다.

- 현재가: `/.netlify/functions/price`
- 과거가격: `/.netlify/functions/historical-price`

따라서 `설정 → 시세 연동`에 URL을 직접 입력할 필요가 없습니다.

월말 흐름:
1. 스크린샷으로 평가금액 갱신
2. `월말 기록` 클릭
3. 티커가 있는 `평가금액 기준` 자산은 그 기준일 가격 조회
4. `평가금액 ÷ 주당 원화가격`으로 추정수량 계산
5. 평가금액/추정수량/가격/환율/기준일을 월별 스냅샷에 저장

변동메모는 계산에 사용하지 않습니다.

## 배포 방법 A: GitHub + Netlify (권장)

1. 이 폴더 전체를 GitHub 저장소에 업로드합니다.
2. Netlify에서 **Add new project → Import an existing project**를 선택합니다.
3. 해당 GitHub 저장소를 연결합니다.
4. 별도 build command는 비워 두고 배포합니다. `netlify.toml`이 publish/functions 경로를 지정합니다.
5. 배포된 사이트 주소로 AssetView를 엽니다.
6. `설정 → 시세 연동`을 열면 같은 사이트의 함수 URL이 자동으로 들어갑니다.

## 배포 방법 B: Netlify CLI

```bash
npm install -g netlify-cli
netlify login
cd assetview-netlify
netlify deploy --prod
```

## 테스트

배포 주소가 `https://example.netlify.app`이라면 브라우저에서 다음을 확인할 수 있습니다.

- `/ .netlify/functions/health`에서 공백을 제거한 `/.netlify/functions/health`
- `/.netlify/functions/price?ticker=AAPL&market=US`
- `/.netlify/functions/price?ticker=005930&market=KR`
- `/.netlify/functions/historical-price?ticker=AAPL&market=US&date=2026-09-30`

정상 응답 예시:

```json
{
  "priceKrw": 350000,
  "price": 250,
  "fx": 1400,
  "currency": "USD",
  "asOf": "2026-10-05",
  "provider": "yahoo"
}
```

## Twelve Data로 전환

Netlify → Site configuration → Environment variables에서:

- `PRICE_PROVIDER` = `twelvedata`
- `TWELVE_DATA_API_KEY` = 발급받은 키

저장 후 다시 배포합니다.
