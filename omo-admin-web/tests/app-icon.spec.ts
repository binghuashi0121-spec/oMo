import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AppIcon from '../src/components/AppIcon.vue';
import { allIconNames, iconPaths, vehicleMarkerColors, vehicleMarkerSvgDataUri } from '../src/icons/registry';

describe('AppIcon', () => {
  it('renders every registered icon as a currentColor inline SVG', () => {
    expect(allIconNames.length).toBeGreaterThanOrEqual(23);

    for (const name of allIconNames) {
      const wrapper = mount(AppIcon, { props: { name } });
      const svg = wrapper.get('svg');
      expect(svg.attributes('data-icon')).toBe(name);
      expect(svg.attributes('stroke')).toBe('currentColor');
      expect(svg.attributes('stroke-width')).toBe('2');
      expect(wrapper.findAll('path')).toHaveLength(iconPaths[name].length);
    }
  });

  it('falls back safely when an unknown runtime name is received', () => {
    const wrapper = mount(AppIcon, { props: { name: 'not-registered' as never } });
    expect(wrapper.find('svg').exists()).toBe(true);
    expect(wrapper.findAll('path')).toHaveLength(iconPaths.info.length);
  });

  it('builds self-contained semantic SVG marker data URIs', () => {
    for (const status of Object.keys(vehicleMarkerColors) as Array<keyof typeof vehicleMarkerColors>) {
      const uri = vehicleMarkerSvgDataUri(status);
      expect(uri).toMatch(/^data:image\/svg\+xml;charset=UTF-8,/);
      expect(decodeURIComponent(uri)).toContain(vehicleMarkerColors[status]);
      expect(decodeURIComponent(uri)).toContain('<path');
    }
    expect(decodeURIComponent(vehicleMarkerSvgDataUri('available', true))).toContain('#ef5b24');
  });
});
