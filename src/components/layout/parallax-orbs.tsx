// 배경의 떠다니는 빛 4개. 움직임은 CSS 애니메이션(globals.css .ambient-orb-*)이 맡는다.
// 예전엔 스크롤마다 transform 을 덮어써 패럴랙스를 하려 했지만, 같은 요소의 CSS 애니메이션이 transform 을
// 이겨서 화면엔 아무 변화가 없고 스크롤 프레임마다 일만 했다(리스너도 안 지워졌다) — 그래서 뺐다.
// 이제 상태가 없어 클라이언트 번들에도 실리지 않는다.
export function ParallaxOrbs() {
  return (
    <>
      <div className="ambient-orb ambient-orb-blue" aria-hidden="true" />
      <div className="ambient-orb ambient-orb-purple" aria-hidden="true" />
      <div className="ambient-orb ambient-orb-teal" aria-hidden="true" />
      <div className="ambient-orb ambient-orb-pink" aria-hidden="true" />
    </>
  );
}
