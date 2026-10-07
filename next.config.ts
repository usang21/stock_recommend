import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 추천 로직 md(skills/final-recommendation/*.md)를 런타임에 fs로 읽는다. 경로를
  // 동적으로 만들기 때문에 Next의 파일 트레이싱이 의존성으로 잡아내지 못해,
  // 서버 번들에 포함되도록 명시한다. 빠지면 배포 환경에서만 ENOENT가 난다.
  outputFileTracingIncludes: {
    "/*": ["skills/**/*.md"],
  },
};

export default nextConfig;
