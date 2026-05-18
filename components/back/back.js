Component({
  properties: {},
  data: { waiting: false },
  methods: {
    onBackTap() {
      if (this.data.waiting) return;
      this.setData({ waiting: true });
      setTimeout(() => {
        wx.navigateBack({ delta: 1 });
        this.setData({ waiting: false });
      }, 200);
    },
  },
});
