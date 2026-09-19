import { afterEach } from 'vitest';

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
Object.defineProperty(globalThis, 'ResizeObserver', { value: ResizeObserverStub, configurable: true });
Object.defineProperty(window, 'matchMedia', { value: () => ({ matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){},dispatchEvent(){return false;} }), configurable:true });
afterEach(() => { sessionStorage.clear(); localStorage.clear(); });
