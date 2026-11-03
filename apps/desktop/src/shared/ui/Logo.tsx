import logoUrl from '../../assets/logo.svg';

interface LogoProps {
  size: number;
}

export function Logo({ size }: LogoProps) {
  return <img src={logoUrl} width={size} height={size} alt="" draggable={false} />;
}
